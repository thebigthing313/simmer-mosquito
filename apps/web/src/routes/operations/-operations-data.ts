import type { GeoJsonGeometry } from '@simmer-mosquito/mapping';
import { ownedCentroidFromGeoJson } from '@simmer-mosquito/mapping';
import type {
	AddressRow,
	ControlType,
	MissionItemRow,
	MissionRow,
	RequestedControlActionRow,
} from '@simmer-mosquito/sync';
import { settleWrite } from '@simmer-mosquito/sync';
import { eq, inArray, useLiveQuery } from '@tanstack/react-db';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { getServerUrl } from '../../auth';
import type {
	MissionProgressCounts,
	MissionStatus,
	RequestStatus,
} from '../../hooks/queries/operations-view';
import { missionStatus, requestStatus } from '../../hooks/queries/operations-view';
import {
	type SchemaCatalogListing,
	useApplicationMethodRoster,
	useBiocontrolMethodRoster,
	useOutreachMethodRoster,
	useSourceReductionMethodRoster,
} from '../../hooks/queries/use-catalog-rosters';
import { addressPrimaryLabel } from '../../lib/address-format';
import { postCommand } from '../../sync/post-command';
import { webCollections } from '../../sync/webCollections';

/**
 * The reads and writes behind the operations section — requested control actions
 * and missions.
 *
 * What is left here is the write half plus the reads the write surfaces depend
 * on. The queue and the schedule read through `hooks/queries` instead; these stay
 * on `webCollections` because a page that writes a row has to read it through the
 * same collection, or the write's txid lands on a stream nothing is watching and
 * the save never settles.
 *
 * Assignments deliberately keep their own module: they are field-work commands
 * against a different set of tables, and the only thing the two share is the
 * navigation group they sit in.
 */

// `missions`, `mission_items`, and `requested_control_actions` are all on-demand
// shapes (docs/sync.md); hold their rows briefly after unmount so map → create →
// back reuses the stream rather than refetching it.
const operationsGcTimeMs = 30_000;

/** A syntactically valid uuid no row matches — keeps a subset predicate live and empty. */
const UNMATCHABLE_ID = '00000000-0000-0000-0000-000000000000';

/**
 * Timestamps are validated against the server's clock with no tolerance, so a
 * client running even slightly fast has its writes rejected as "in the future"
 * (issue #37). Backdating by a couple of seconds costs nothing on a provenance
 * timestamp — see the same margin in `-assignment-data`.
 */
const CLOCK_SKEW_MARGIN_MS = 2_000;

function nowTimestamp(): string {
	return new Date(Date.now() - CLOCK_SKEW_MARGIN_MS).toISOString();
}

// --- derived state ----------------------------------------------------------

/**
 * A mission needs somewhere to go before it can be dispatched.
 *
 * The server enforces this one itself (`checkStartMission`), so the button is
 * disabled rather than hidden — the reason is the empty stop list right below it.
 */
export function canStartMission(status: MissionStatus, counts: MissionProgressCounts): boolean {
	return status === 'scheduled' && counts.total > 0;
}

/** Every stop worked or passed over. Also enforced server-side. */
export function canCompleteMission(status: MissionStatus, counts: MissionProgressCounts): boolean {
	return status === 'inProgress' && counts.total > 0 && counts.pending === 0;
}

/** Stops are worked while the mission is running, and only then. */
export function canProgressMissionItems(status: MissionStatus): boolean {
	return status === 'inProgress';
}

/**
 * Recording the action a stop was dispatched for, which is a wider gate than
 * {@link canProgressMissionItems}.
 *
 * Done and Skip need a running mission. Recording does not: `autoStartMission`
 * defaults true so the crew's first record of the day starts the mission, and
 * the server permits it. Sharing the progress gate made that unreachable — the
 * mirror of the same mistake on the assignment side. See
 * `docs/mission-dispatch-domain.md`.
 */
export function canRecordMissionStopWork(status: MissionStatus): boolean {
	return status === 'scheduled' || status === 'inProgress';
}

/** A finished mission is a record. Reopen it before changing what it covers. */
export function canEditMissionPlan(status: MissionStatus): boolean {
	return status === 'scheduled' || status === 'inProgress';
}

export type MissionItemAction = 'complete' | 'skip' | 'unskip' | 'reopen';

/**
 * The controls a stop offers, in the order the server resolves them.
 *
 * `readItemLifecycleTransition` checks `skippedAt` before `completedAt`, so a
 * skipped stop must never be offered Complete: the PATCH would be read as a
 * skip-then-complete and the row would keep reading as skipped until sync
 * corrected it. Unskip first is the only legal path.
 */
export function missionItemActionsFor(progress: MissionItemProgress): readonly MissionItemAction[] {
	if (progress === 'skipped') {
		return ['unskip'];
	}
	if (progress === 'completed') {
		return ['reopen'];
	}
	return ['complete', 'skip'];
}

/** Item progress. Skipped is checked first, matching `deriveMissionItemStatus`. */
export type MissionItemProgress = 'pending' | 'completed' | 'skipped';

export function missionItemProgress(
	row: Pick<MissionItemRow, 'completedAt' | 'skippedAt'>,
): MissionItemProgress {
	if (row.skippedAt !== null) {
		return 'skipped';
	}
	return row.completedAt === null ? 'pending' : 'completed';
}

function missionProgressCounts(
	items: readonly Pick<MissionItemRow, 'completedAt' | 'skippedAt'>[],
): MissionProgressCounts {
	let completed = 0;
	let skipped = 0;
	for (const item of items) {
		const progress = missionItemProgress(item);
		if (progress === 'completed') {
			completed += 1;
		} else if (progress === 'skipped') {
			skipped += 1;
		}
	}
	const handled = completed + skipped;
	return {
		total: items.length,
		completed,
		skipped,
		pending: items.length - handled,
		handled,
	};
}

// --- view models ------------------------------------------------------------

export interface RequestView extends RequestedControlActionRow {
	readonly status: RequestStatus;
}

export interface MissionView extends MissionRow {
	readonly status: MissionStatus;
}

/** One stop on a mission: its own place on the map, plus whatever names it. */
export interface MissionStopView {
	readonly missionItemId: string;
	/** 1-indexed place in the sequence, derived from `position` order at read time. */
	readonly ordinal: number;
	readonly position: number;
	readonly lat: number;
	readonly lng: number;
	/**
	 * The shape the stop was drawn as, once the display endpoint has answered.
	 *
	 * Null until then, and for a stop whose shape is a plain point — the pin at
	 * `lat`/`lng` already is that point, and drawing it twice gains nothing.
	 */
	readonly geometry: GeoJsonGeometry | null;
	readonly requestedControlActionId: string | null;
	/** The request this stop came from, once its row has streamed. */
	readonly request: RequestedControlActionRow | null;
	readonly addressId: string | null;
	readonly addressLabel: string | null;
	readonly progress: MissionItemProgress;
	readonly skipReason: string | null;
	readonly completedAt: string | null;
	readonly skippedAt: string | null;
	readonly hasLocation: boolean;
	/** A linked row is still streaming. False with no name means the link is gone. */
	readonly isResolving: boolean;
}

/**
 * A `date` column as the day it names — a mission's rain date, not an instant.
 *
 * The opposite hazard to `formatScheduledStart`: naming a zone here would
 * *introduce* the shift. `new Date('2026-08-04')` is UTC midnight, so a zone
 * west of Greenwich renders it as the 3rd. Rebuilt in UTC, where it cannot move.
 */
export function formatOperationalDate(value: string): string {
	const parts = value.slice(0, 10).split('-');
	const year = Number(parts[0]);
	const month = Number(parts[1]);
	const day = Number(parts[2]);
	if (!(Number.isFinite(year) && Number.isFinite(month) && Number.isFinite(day))) {
		return value;
	}
	return new Intl.DateTimeFormat(undefined, {
		year: 'numeric',
		month: 'short',
		day: 'numeric',
		timeZone: 'UTC',
	}).format(new Date(Date.UTC(year, month - 1, day)));
}

// --- reads ------------------------------------------------------------------

/** One request. Also the warm-stream anchor on pages that write before reading. */
export function useRequestedControlAction(requestId: string | null): {
	readonly request: RequestView | null;
	readonly isReady: boolean;
} {
	const result = useLiveQuery(
		{
			gcTime: operationsGcTimeMs,
			query: (query) =>
				query
					.from({ request: webCollections.requestedControlActions })
					.where(({ request }) => eq(request.id, requestId ?? UNMATCHABLE_ID)),
		},
		[requestId],
	);

	const rows = (result.data ?? []) as readonly RequestedControlActionRow[];
	const row = rows[0];

	return {
		request: row === undefined ? null : { ...row, status: requestStatus(row) },
		isReady: result.isReady,
	};
}

/** One mission. Also the warm-stream anchor for the create page's write. */
export function useMission(missionId: string | null): {
	readonly mission: MissionView | null;
	readonly isReady: boolean;
} {
	const result = useLiveQuery(
		{
			gcTime: operationsGcTimeMs,
			query: (query) =>
				query
					.from({ mission: webCollections.missions })
					.where(({ mission }) => eq(mission.id, missionId ?? UNMATCHABLE_ID)),
		},
		[missionId],
	);

	const rows = (result.data ?? []) as readonly MissionRow[];
	const row = rows[0];

	return {
		mission: row === undefined ? null : { ...row, status: missionStatus(row) },
		isReady: result.isReady,
	};
}

/** A mission's items in dispatch order — the rows every stop view is built from. */
function useMissionItems(missionId: string | null): {
	readonly items: readonly MissionItemRow[];
	readonly isLoading: boolean;
	readonly isReady: boolean;
} {
	const result = useLiveQuery(
		{
			gcTime: operationsGcTimeMs,
			query: (query) =>
				query
					.from({ item: webCollections.missionItems })
					.where(({ item }) => eq(item.missionId, missionId ?? UNMATCHABLE_ID))
					.orderBy(({ item }) => item.position, 'asc'),
		},
		[missionId],
	);

	return {
		items: (result.data ?? []) as readonly MissionItemRow[],
		isLoading: missionId !== null && result.isLoading,
		isReady: result.isReady,
	};
}

/**
 * Every stop's real shape on a mission, by mission item id.
 *
 * The Electric shape streams only the centroid (ADR 0009), so a stop that is a
 * ditch run or a treated block arrives as a dot. The drawn shapes come from the
 * mission's own display endpoint instead — one request for the whole mission,
 * because both surfaces that draw stops draw all of a mission's at once.
 *
 * The cache key carries every item's `updatedAt`, so redrawing a stop, adding
 * one, or removing one refetches; nothing else does.
 */
function useMissionItemShapes(
	missionId: string | null,
	items: readonly MissionItemRow[],
): ReadonlyMap<string, GeoJsonGeometry> {
	const version = useMemo(
		() =>
			items
				.map((item) => `${item.id}:${item.updatedAt}`)
				.sort()
				.join('|'),
		[items],
	);

	const query = useQuery({
		queryKey: ['mission-item-geometry', missionId ?? 'none', version],
		queryFn: ({ signal }) =>
			missionId === null || items.length === 0
				? Promise.resolve([])
				: fetchMissionItemGeometry(missionId, signal),
		placeholderData: (previous) => previous,
		staleTime: Number.POSITIVE_INFINITY,
	});

	return useMemo(
		() => new Map((query.data ?? []).map((row) => [row.id, row.geojson] as const)),
		[query.data],
	);
}

interface MissionItemGeometryRow {
	readonly id: string;
	readonly geojson: GeoJsonGeometry | null;
}

async function fetchMissionItemGeometry(
	missionId: string,
	signal: AbortSignal,
): Promise<readonly { readonly id: string; readonly geojson: GeoJsonGeometry }[]> {
	const url = new URL(`/map/missions/${missionId}/items`, getServerUrl());
	const response = await fetch(url, { credentials: 'include', signal });
	if (response.status === 404) {
		return [];
	}
	if (!response.ok) {
		throw new Error(`Mission stop geometry request failed with ${response.status}`);
	}

	const body = (await response.json()) as {
		readonly missionItems?: readonly MissionItemGeometryRow[];
	};
	return (body.missionItems ?? []).flatMap((row) =>
		row.geojson === null ? [] : [{ id: row.id, geojson: row.geojson }],
	);
}

/**
 * A mission's stops, joined to whatever names them and to the shapes they were
 * drawn as, ready to render or map.
 *
 * A stop owns its geometry outright — unlike an assignment stop, which is a
 * pointer at a trap or a habitat — so it always has a place on the map even when
 * nothing it links to has loaded. What the joins add is a *name*: the request it
 * came from, or failing that the address it sits at.
 */
export function useMissionStops(missionId: string | null): {
	readonly stops: readonly MissionStopView[];
	readonly counts: MissionProgressCounts;
	readonly isLoading: boolean;
} {
	const { items, isLoading } = useMissionItems(missionId);

	const requestIds = useMemo(() => {
		const ids = new Set<string>();
		for (const item of items) {
			if (item.requestedControlActionId !== null) {
				ids.add(item.requestedControlActionId);
			}
		}
		return [...ids].sort();
	}, [items]);
	const requestKey = requestIds.join(',');

	const addressIds = useMemo(() => {
		const ids = new Set<string>();
		for (const item of items) {
			if (item.addressId !== null) {
				ids.add(item.addressId);
			}
		}
		return [...ids].sort();
	}, [items]);
	const addressKey = addressIds.join(',');

	const requestResult = useLiveQuery(
		{
			gcTime: operationsGcTimeMs,
			query: (query) =>
				query
					.from({ request: webCollections.requestedControlActions })
					.where(({ request }) =>
						inArray(request.id, requestIds.length > 0 ? requestIds : [UNMATCHABLE_ID]),
					),
		},
		[requestKey],
	);

	const addressResult = useLiveQuery(
		{
			gcTime: operationsGcTimeMs,
			query: (query) =>
				query
					.from({ address: webCollections.addresses })
					.where(({ address }) =>
						inArray(address.id, addressIds.length > 0 ? addressIds : [UNMATCHABLE_ID]),
					),
		},
		[addressKey],
	);

	const requestById = useMemo(
		() =>
			new Map(
				((requestResult.data ?? []) as readonly RequestedControlActionRow[]).map(
					(row) => [row.id, row] as const,
				),
			),
		[requestResult.data],
	);
	const addressLabelById = useMemo(
		() =>
			new Map(
				((addressResult.data ?? []) as readonly AddressRow[]).map(
					(row) => [row.id, addressPrimaryLabel(row)] as const,
				),
			),
		[addressResult.data],
	);

	const linksReady = requestResult.isReady && addressResult.isReady;
	const shapeById = useMissionItemShapes(missionId, items);

	const stops = useMemo<readonly MissionStopView[]>(
		() =>
			items.map((item, index) =>
				toMissionStop(item, index, { requestById, addressLabelById, shapeById, linksReady }),
			),
		[items, requestById, addressLabelById, shapeById, linksReady],
	);

	return { stops, counts: missionProgressCounts(items), isLoading };
}

function toMissionStop(
	item: MissionItemRow,
	index: number,
	links: {
		readonly requestById: ReadonlyMap<string, RequestedControlActionRow>;
		readonly addressLabelById: ReadonlyMap<string, string>;
		readonly shapeById: ReadonlyMap<string, GeoJsonGeometry>;
		readonly linksReady: boolean;
	},
): MissionStopView {
	const requestId = item.requestedControlActionId;
	return {
		missionItemId: item.id,
		ordinal: index + 1,
		position: item.position,
		lat: item.lat,
		lng: item.lng,
		geometry: links.shapeById.get(item.id) ?? null,
		requestedControlActionId: requestId,
		request: requestId === null ? null : (links.requestById.get(requestId) ?? null),
		addressId: item.addressId,
		addressLabel:
			item.addressId === null ? null : (links.addressLabelById.get(item.addressId) ?? null),
		progress: missionItemProgress(item),
		skipReason: item.skipReason,
		completedAt: item.completedAt,
		skippedAt: item.skippedAt,
		hasLocation: Number.isFinite(item.lat) && Number.isFinite(item.lng),
		isResolving: !links.linksReady && (requestId !== null || item.addressId !== null),
	};
}

/**
 * Open requests in the org, newest first — what a mission can be pointed at.
 *
 * Resolution is a nullable timestamp rather than a column, so it is filtered in
 * memory over the same window-free subset the picker searches. Resolved requests
 * are deliberately absent: a request already dealt with is not new work to plan,
 * even though a stop already on a mission keeps its link if it is resolved later.
 */
export function useOpenRequestedControlActions(organizationId: string): {
	readonly requests: readonly RequestedControlActionRow[];
	readonly isReady: boolean;
} {
	const result = useLiveQuery(
		{
			gcTime: operationsGcTimeMs,
			query: (query) =>
				query
					.from({ request: webCollections.requestedControlActions })
					.where(({ request }) => eq(request.organizationId, organizationId))
					.orderBy(({ request }) => request.requestedAt, 'desc'),
		},
		[organizationId],
	);

	const requests = useMemo(
		() =>
			((result.data ?? []) as readonly RequestedControlActionRow[]).filter(
				(request) => request.resolvedAt === null,
			),
		[result.data],
	);

	return { requests, isReady: result.isReady };
}

/**
 * The missions a request has been scheduled onto.
 *
 * Two hops, because the link lives on the mission *item*: a request is put on a
 * mission by becoming one of its stops. A request can appear on more than one —
 * the domain flags that rather than forbidding it — so this reads as a list.
 */
export function useMissionsForRequest(requestId: string | null): {
	readonly missions: readonly MissionView[];
	readonly isReady: boolean;
} {
	const itemResult = useLiveQuery(
		{
			gcTime: operationsGcTimeMs,
			query: (query) =>
				query
					.from({ item: webCollections.missionItems })
					.where(({ item }) => eq(item.requestedControlActionId, requestId ?? UNMATCHABLE_ID)),
		},
		[requestId],
	);

	const missionIds = useMemo(() => {
		const ids = new Set(
			((itemResult.data ?? []) as readonly MissionItemRow[]).map((item) => item.missionId),
		);
		return [...ids].sort();
	}, [itemResult.data]);
	const idsKey = missionIds.join(',');

	const missionResult = useLiveQuery(
		{
			gcTime: operationsGcTimeMs,
			query: (query) =>
				query
					.from({ mission: webCollections.missions })
					.where(({ mission }) =>
						inArray(mission.id, missionIds.length > 0 ? missionIds : [UNMATCHABLE_ID]),
					)
					.orderBy(({ mission }) => mission.scheduledStartAt, 'desc'),
		},
		[idsKey],
	);

	const missions = useMemo(
		() =>
			((missionResult.data ?? []) as readonly MissionRow[]).map((row) => ({
				...row,
				status: missionStatus(row),
			})),
		[missionResult.data],
	);

	return { missions, isReady: itemResult.isReady && missionResult.isReady };
}

/**
 * The method catalog for a control type.
 *
 * `recommendedMethodId` and `plannedMethodId` are both polymorphic by control
 * type — the id points at a different table for each — so a form that lets the
 * type change has to re-source its options from here rather than hold one list.
 */
export function useMethodsForControlType(controlType: ControlType | ''): {
	readonly methods: readonly SchemaCatalogListing[];
} {
	const applicationMethods = useApplicationMethodRoster();
	const sourceReductionMethods = useSourceReductionMethodRoster();
	const biocontrolMethods = useBiocontrolMethodRoster();
	const outreachMethods = useOutreachMethodRoster();

	const methods = useMemo(() => {
		switch (controlType) {
			case 'application':
				return applicationMethods;
			case 'source_reduction':
				return sourceReductionMethods;
			case 'biocontrol':
				return biocontrolMethods;
			case 'outreach':
				return outreachMethods;
			default:
				return [];
		}
	}, [controlType, applicationMethods, sourceReductionMethods, biocontrolMethods, outreachMethods]);

	return { methods };
}

// --- writes -----------------------------------------------------------------

/**
 * Raise a request for control.
 *
 * The geometry is the request's own authoritative location; the address, habitat,
 * inspection, and collection links are context. The server recomputes `geom` from
 * `locationSource`, so the centroid written here only seeds the optimistic row —
 * without it the new pin would not appear until the shape round-trips.
 */
export async function createRequestedControlAction(input: {
	readonly requestId: string;
	readonly organizationId: string;
	readonly actorProfileId: string;
	readonly controlType: ControlType;
	readonly geometry: GeoJsonGeometry;
	readonly summary: string | null;
	readonly recommendedMethodId: string | null;
	readonly addressId: string | null;
	readonly habitatId: string | null;
}): Promise<void> {
	const centroid = ownedCentroidFromGeoJson(input.geometry);
	if (centroid === null) {
		throw new Error('Unable to determine the requested location.');
	}

	const now = new Date().toISOString();
	const row: RequestedControlActionRow = {
		id: input.requestId,
		organizationId: input.organizationId,
		lat: centroid.lat,
		lng: centroid.lng,
		geomType: centroid.geomType,
		controlType: input.controlType,
		recommendedMethodId: input.recommendedMethodId,
		summary: input.summary,
		habitatId: input.habitatId,
		inspectionId: null,
		collectionId: null,
		addressId: input.addressId,
		requestedByProfileId: input.actorProfileId,
		requestedAt: nowTimestamp(),
		resolvedAt: null,
		resolvedByProfileId: null,
		createdByProfileId: input.actorProfileId,
		updatedByProfileId: input.actorProfileId,
		createdAt: now,
		updatedAt: now,
	};

	await settleWrite(
		webCollections.requestedControlActions.insert(row, {
			metadata: { locationSource: { kind: 'geometry', geometry: input.geometry } },
		}),
	);
}

/**
 * Create a mission.
 *
 * Missions carry no geometry of their own — their footprint is the union of their
 * items, which are added afterwards. A mission with no items is a valid, legal
 * plan; it simply cannot be started until it has one.
 */
export async function createMission(input: {
	readonly missionId: string;
	readonly organizationId: string;
	readonly actorProfileId: string;
	readonly controlType: ControlType;
	readonly scheduledStartAt: string;
	readonly scheduledEndAt: string | null;
	readonly missionName: string | null;
	readonly plannedMethodId: string | null;
	readonly assignedToProfileId: string | null;
	readonly rainDate: string | null;
	readonly notificationTypeId: string | null;
}): Promise<void> {
	const now = new Date().toISOString();
	const row: MissionRow = {
		id: input.missionId,
		organizationId: input.organizationId,
		missionName: input.missionName,
		controlType: input.controlType,
		plannedMethodId: input.plannedMethodId,
		assignedToProfileId: input.assignedToProfileId,
		// Mirrors what the server records, so the row does not flicker.
		assignedByProfileId: input.assignedToProfileId === null ? null : input.actorProfileId,
		scheduledStartAt: input.scheduledStartAt,
		scheduledEndAt: input.scheduledEndAt,
		rainDate: input.rainDate,
		startedAt: null,
		completedAt: null,
		cancelledAt: null,
		cancellationReason: null,
		notificationTypeId: input.notificationTypeId,
		createdByProfileId: input.actorProfileId,
		updatedByProfileId: input.actorProfileId,
		createdAt: now,
		updatedAt: now,
	};

	await settleWrite(webCollections.missions.insert(row));
}

/**
 * Every write below is a plain collection update, because the PATCH handlers
 * derive their command from *which* fields changed rather than from a verb in
 * the body. Two consequences worth knowing before adding one:
 *
 * 1. Planning fields and lifecycle timestamps must never ride the same update.
 *    One PATCH body builds both command families, so an edit that "normalises"
 *    `completedAt` back to null while saving a name would silently reopen the
 *    mission.
 * 2. A field is only sent when it actually changes, so writing the value a row
 *    already holds is a no-op rather than a redundant command — which is why
 *    each helper can null every field its transition owns without checking
 *    whether they were already null.
 */

type MutableMissionRow = { -readonly [Key in keyof MissionRow]: MissionRow[Key] };
type MutableMissionItemRow = { -readonly [Key in keyof MissionItemRow]: MissionItemRow[Key] };
type MutableRequestRow = {
	-readonly [Key in keyof RequestedControlActionRow]: RequestedControlActionRow[Key];
};

/**
 * Edit a mission's plan.
 *
 * Deliberately touches no lifecycle timestamp. One PATCH body builds both the
 * planning and the lifecycle command families, so writing `completedAt` here —
 * even back to the value it already holds — would read as a transition.
 *
 * `assignedByProfileId` is mirrored the way the server stamps it, so the row does
 * not flicker between what this wrote and what came back.
 */
export async function updateMission(input: {
	readonly missionId: string;
	readonly actorProfileId: string | null;
	readonly controlType: ControlType;
	readonly scheduledStartAt: string;
	readonly scheduledEndAt: string | null;
	readonly missionName: string | null;
	readonly plannedMethodId: string | null;
	readonly assignedToProfileId: string | null;
	readonly rainDate: string | null;
	readonly notificationTypeId: string | null;
}): Promise<void> {
	const now = new Date().toISOString();
	await settleWrite(
		webCollections.missions.update(input.missionId, (draft) => {
			const mutable = draft as MutableMissionRow;
			mutable.controlType = input.controlType;
			mutable.scheduledStartAt = input.scheduledStartAt;
			mutable.scheduledEndAt = input.scheduledEndAt;
			mutable.missionName = input.missionName;
			mutable.plannedMethodId = input.plannedMethodId;
			mutable.rainDate = input.rainDate;
			mutable.notificationTypeId = input.notificationTypeId;
			if (mutable.assignedToProfileId !== input.assignedToProfileId) {
				mutable.assignedToProfileId = input.assignedToProfileId;
				mutable.assignedByProfileId =
					input.assignedToProfileId === null ? null : input.actorProfileId;
			}
			if (input.actorProfileId !== null) {
				mutable.updatedByProfileId = input.actorProfileId;
			}
			mutable.updatedAt = now;
		}),
	);
}

export async function startMission(missionId: string): Promise<void> {
	await settleWrite(
		webCollections.missions.update(missionId, (draft) => {
			(draft as MutableMissionRow).startedAt = nowTimestamp();
		}),
	);
}

/**
 * Finish a mission.
 *
 * The server auto-starts one completed straight from scheduled, so `startedAt`
 * is left alone here rather than guessed at — the row that syncs back carries
 * whichever start the server settled on.
 */
export async function completeMission(missionId: string): Promise<void> {
	await settleWrite(
		webCollections.missions.update(missionId, (draft) => {
			(draft as MutableMissionRow).completedAt = nowTimestamp();
		}),
	);
}

/** Cancelling carries its reason in the same draft, so one PATCH holds both. */
export async function cancelMission(missionId: string, cancellationReason: string): Promise<void> {
	await settleWrite(
		webCollections.missions.update(missionId, (draft) => {
			const mutable = draft as MutableMissionRow;
			mutable.cancelledAt = nowTimestamp();
			mutable.cancellationReason = cancellationReason;
		}),
	);
}

/**
 * Reopen a closed mission, recording why.
 *
 * `startedAt` is deliberately left alone: the server keeps it, since reopening
 * resumes work rather than resetting it and nothing else on the row records when
 * the crew actually started.
 *
 * The reason travels as metadata rather than on the draft. It is not a column —
 * the server writes it as a comment — and this update *clears* the terminal
 * fields, so without that comment a reopened mission would carry no trace of
 * having been closed or why it was picked back up.
 */
export async function reopenMission(missionId: string, reopenReason: string): Promise<void> {
	await settleWrite(
		webCollections.missions.update(missionId, { metadata: { reopenReason } }, (draft) => {
			const mutable = draft as MutableMissionRow;
			mutable.completedAt = null;
			mutable.cancelledAt = null;
			mutable.cancellationReason = null;
		}),
	);
}

/**
 * Put a request on a mission as its next stop.
 *
 * The server takes the stop's geometry from the request rather than the wire —
 * sending no location is what selects the `addMissionItemFromRequestedControlAction`
 * command — so the centroid copied here only seeds the optimistic row. Without it
 * the new pin would not appear until the shape round-trips.
 */
export async function addMissionItemFromRequest(input: {
	readonly missionItemId: string;
	readonly missionId: string;
	readonly organizationId: string;
	readonly actorProfileId: string | null;
	readonly request: Pick<
		RequestedControlActionRow,
		'id' | 'lat' | 'lng' | 'geomType' | 'addressId'
	>;
	readonly position: number;
}): Promise<void> {
	const now = new Date().toISOString();
	const row: MissionItemRow = {
		id: input.missionItemId,
		organizationId: input.organizationId,
		missionId: input.missionId,
		lat: input.request.lat,
		lng: input.request.lng,
		geomType: input.request.geomType,
		requestedControlActionId: input.request.id,
		// Left null so the POST carries no address and the server reads the stop as
		// "from this request", geometry and all.
		addressId: null,
		position: input.position,
		completedAt: null,
		completedByProfileId: null,
		skippedAt: null,
		skippedByProfileId: null,
		skipReason: null,
		createdByProfileId: input.actorProfileId,
		updatedByProfileId: input.actorProfileId,
		createdAt: now,
		updatedAt: now,
	};
	await settleWrite(webCollections.missionItems.insert(row));
}

/**
 * Add a stop the crew has to visit that no request asked for.
 *
 * The stop owns its geometry outright — Point, LineString, or Polygon, whatever
 * the operator drew — rather than inheriting a request's. Sending a location
 * source with no `requestedControlActionId` is what selects the plain
 * `addMissionItem` command server-side; the centroid written here only seeds the
 * optimistic row, since the server recomputes `geom` from the source.
 *
 * The address is a label, not the location: a stop placed at an address still
 * stores the shape that was drawn.
 */
export async function addMissionItemAtGeometry(input: {
	readonly missionItemId: string;
	readonly missionId: string;
	readonly organizationId: string;
	readonly actorProfileId: string | null;
	readonly geometry: GeoJsonGeometry;
	readonly addressId: string | null;
	readonly position: number;
}): Promise<void> {
	const centroid = ownedCentroidFromGeoJson(input.geometry);
	if (centroid === null) {
		throw new Error('Unable to determine where this stop is.');
	}

	const now = new Date().toISOString();
	const row: MissionItemRow = {
		id: input.missionItemId,
		organizationId: input.organizationId,
		missionId: input.missionId,
		lat: centroid.lat,
		lng: centroid.lng,
		geomType: centroid.geomType,
		requestedControlActionId: null,
		addressId: input.addressId,
		position: input.position,
		completedAt: null,
		completedByProfileId: null,
		skippedAt: null,
		skippedByProfileId: null,
		skipReason: null,
		createdByProfileId: input.actorProfileId,
		updatedByProfileId: input.actorProfileId,
		createdAt: now,
		updatedAt: now,
	};

	await settleWrite(
		webCollections.missionItems.insert(row, {
			metadata: { locationSource: { kind: 'geometry', geometry: input.geometry } },
		}),
	);
}

export async function removeMissionItem(missionItemId: string): Promise<void> {
	await settleWrite(webCollections.missionItems.delete(missionItemId));
}

/**
 * Stop progress.
 *
 * The `*ByProfileId` columns are mirrored optimistically so a row does not
 * flicker between what the page wrote and what the server stamped. They are not
 * patch keys, so they never reach the wire — the server sets them from the
 * authenticated actor.
 */
export async function completeMissionItem(
	missionItemId: string,
	actorProfileId: string | null,
): Promise<void> {
	await settleWrite(
		webCollections.missionItems.update(missionItemId, (draft) => {
			const mutable = draft as MutableMissionItemRow;
			mutable.completedAt = nowTimestamp();
			mutable.completedByProfileId = actorProfileId;
		}),
	);
}

export async function skipMissionItem(
	missionItemId: string,
	skipReason: string,
	actorProfileId: string | null,
): Promise<void> {
	await settleWrite(
		webCollections.missionItems.update(missionItemId, (draft) => {
			const mutable = draft as MutableMissionItemRow;
			mutable.skippedAt = nowTimestamp();
			mutable.skipReason = skipReason;
			mutable.skippedByProfileId = actorProfileId;
		}),
	);
}

export async function unskipMissionItem(missionItemId: string): Promise<void> {
	await settleWrite(
		webCollections.missionItems.update(missionItemId, (draft) => {
			const mutable = draft as MutableMissionItemRow;
			mutable.skippedAt = null;
			mutable.skipReason = null;
			mutable.skippedByProfileId = null;
		}),
	);
}

export async function reopenMissionItem(missionItemId: string): Promise<void> {
	await settleWrite(
		webCollections.missionItems.update(missionItemId, (draft) => {
			const mutable = draft as MutableMissionItemRow;
			mutable.completedAt = null;
			mutable.completedByProfileId = null;
		}),
	);
}

/**
 * Reorder stops server-side.
 *
 * The shared planner names the anchor `anchorId`; this endpoint calls it
 * `missionItemId`. Translating here keeps the wire vocabulary in the module that
 * owns it.
 */
export async function moveMissionItems(
	missionId: string,
	missionItemIds: readonly string[],
	placement:
		| { readonly kind: 'start' }
		| { readonly kind: 'end' }
		| { readonly kind: 'before'; readonly anchorId: string }
		| { readonly kind: 'after'; readonly anchorId: string },
): Promise<void> {
	const wirePlacement =
		placement.kind === 'before' || placement.kind === 'after'
			? { kind: placement.kind, missionItemId: placement.anchorId }
			: placement;
	await postCommand(
		`/mission-dispatch/missions/${missionId}/move-items`,
		{ missionItemIds: [...missionItemIds], placement: wirePlacement },
		'Unable to reorder the mission.',
	);
}

/**
 * Close a request out.
 *
 * There is no outcome field: handled, duplicate, and not feasible all resolve
 * the same row, and which it was belongs in the comments where it can be read.
 */
export async function resolveRequest(
	requestId: string,
	actorProfileId: string | null,
): Promise<void> {
	await settleWrite(
		webCollections.requestedControlActions.update(requestId, (draft) => {
			const mutable = draft as MutableRequestRow;
			mutable.resolvedAt = nowTimestamp();
			mutable.resolvedByProfileId = actorProfileId;
		}),
	);
}

/**
 * Edit a request's details, location, and context.
 *
 * The PATCH handler builds its commands from which fields changed, so this
 * touches no lifecycle column: resolving and reopening are their own writes, and
 * folding `resolvedAt` into an edit would reopen a closed request nobody meant to
 * touch.
 *
 * `geometry` is sent only when the shape was actually redrawn. The server
 * re-resolves `geom` from whatever location source it is handed, so re-sending
 * an unchanged shape is a write with no edit behind it — and the centroid mirrored
 * onto the optimistic row would flicker for nothing.
 */
export async function updateRequestedControlAction(input: {
	readonly requestId: string;
	readonly actorProfileId: string | null;
	readonly controlType: ControlType;
	readonly summary: string | null;
	readonly recommendedMethodId: string | null;
	readonly addressId: string | null;
	readonly habitatId: string | null;
	/** Null leaves the stored shape alone. */
	readonly geometry: GeoJsonGeometry | null;
}): Promise<void> {
	const centroid = input.geometry === null ? null : ownedCentroidFromGeoJson(input.geometry);
	if (input.geometry !== null && centroid === null) {
		throw new Error('Unable to determine the requested location.');
	}

	const now = new Date().toISOString();
	const applyEdits = (draft: RequestedControlActionRow) => {
		const mutable = draft as MutableRequestRow;
		mutable.controlType = input.controlType;
		mutable.summary = input.summary;
		mutable.recommendedMethodId = input.recommendedMethodId;
		mutable.addressId = input.addressId;
		mutable.habitatId = input.habitatId;
		if (centroid !== null) {
			mutable.lat = centroid.lat;
			mutable.lng = centroid.lng;
			mutable.geomType = centroid.geomType;
		}
		if (input.actorProfileId !== null) {
			mutable.updatedByProfileId = input.actorProfileId;
		}
		mutable.updatedAt = now;
	};

	await settleWrite(
		input.geometry === null
			? webCollections.requestedControlActions.update(input.requestId, applyEdits)
			: webCollections.requestedControlActions.update(
					input.requestId,
					{ metadata: { locationSource: { kind: 'geometry', geometry: input.geometry } } },
					applyEdits,
				),
	);
}

export async function reopenRequest(requestId: string): Promise<void> {
	await settleWrite(
		webCollections.requestedControlActions.update(requestId, (draft) => {
			const mutable = draft as MutableRequestRow;
			mutable.resolvedAt = null;
			mutable.resolvedByProfileId = null;
		}),
	);
}
