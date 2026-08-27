import type { GeoJsonGeometry } from '@simmer-mosquito/mapping';
import type { ControlType } from '@simmer-mosquito/sync';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { getServerUrl } from '../../auth';
import { resolveLinkedAddress } from '../../hooks/queries/address-view';
import type {
	MissionProgressCounts,
	MissionStatus,
	MissionStop,
} from '../../hooks/queries/operations-view';
import {
	type SchemaCatalogListing,
	useApplicationMethodRoster,
	useBiocontrolMethodRoster,
	useOutreachMethodRoster,
	useSourceReductionMethodRoster,
} from '../../hooks/queries/use-catalog-rosters';
import { useMissionStops } from '../../hooks/queries/use-mission-stops';
import { addressPrimaryLabel } from '../../lib/address-format';

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
const _operationsGcTimeMs = 30_000;

/** A syntactically valid uuid no row matches — keeps a subset predicate live and empty. */
const _UNMATCHABLE_ID = '00000000-0000-0000-0000-000000000000';

/**
 * Timestamps are validated against the server's clock with no tolerance, so a
 * client running even slightly fast has its writes rejected as "in the future"
 * (issue #37). Backdating by a couple of seconds costs nothing on a provenance
 * timestamp — see the same margin in `-assignment-data`.
 */
const CLOCK_SKEW_MARGIN_MS = 2_000;

function _nowTimestamp(): string {
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

export function missionItemProgress(row: {
	readonly completedAt: Date | null;
	readonly skippedAt: Date | null;
}): MissionItemProgress {
	if (row.skippedAt !== null) {
		return 'skipped';
	}
	return row.completedAt === null ? 'pending' : 'completed';
}

function missionProgressCounts(
	items: readonly { readonly completedAt: Date | null; readonly skippedAt: Date | null }[],
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

/** What names a stop drawn off a request. */
export interface MissionStopRequest {
	readonly id: string;
	readonly summary: string | null;
	readonly controlType: string;
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
	/**
	 * What the request this stop came from is called, once its row has streamed.
	 *
	 * The three fields anything showing a stop reads, rather than the request row:
	 * a stop is *named* by its request, and the request's other thirty columns are
	 * its own page's business.
	 */
	readonly request: MissionStopRequest | null;
	readonly addressId: string | null;
	readonly addressLabel: string | null;
	readonly progress: MissionItemProgress;
	readonly skipReason: string | null;
	readonly completedAt: Date | null;
	readonly skippedAt: Date | null;
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
	items: readonly { readonly id: string; readonly updatedAt: Date }[],
): ReadonlyMap<string, GeoJsonGeometry> {
	const version = useMemo(
		() =>
			items
				.map((item) => `${item.id}:${item.updatedAt.getTime()}`)
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
 * The joins are in `hooks/queries/use-mission-stops.ts`. What is composed here is
 * what a *page* adds to them: the shape each stop was actually drawn as, which
 * comes from a `/map/*` endpoint rather than a collection, and the ordinal, which
 * is a fact about the list rather than about any row in it.
 *
 * A stop owns its geometry outright — unlike an assignment stop, which is a
 * pointer at a trap or a habitat — so it always has a place on the map even when
 * nothing it links to has loaded. What the joins add is a *name*: the request it
 * came from, or failing that the address it sits at.
 */
export function useMissionStopViews(missionId: string | null): {
	readonly stops: readonly MissionStopView[];
	readonly counts: MissionProgressCounts;
	readonly isLoading: boolean;
} {
	const { stops: rows, isLoading, isReady } = useMissionStops(missionId);
	const shapeById = useMissionItemShapes(missionId, rows);

	const stops = useMemo<readonly MissionStopView[]>(
		() => rows.map((row, index) => toMissionStop(row, index, shapeById, isReady)),
		[rows, shapeById, isReady],
	);

	const counts = useMemo(() => missionProgressCounts(stops), [stops]);

	return { stops, counts, isLoading };
}

function toMissionStop(
	row: MissionStop,
	index: number,
	shapeById: ReadonlyMap<string, GeoJsonGeometry>,
	linksReady: boolean,
): MissionStopView {
	const address = resolveLinkedAddress(row.address);
	return {
		missionItemId: row.id,
		ordinal: index + 1,
		position: row.position,
		lat: row.latitude,
		lng: row.longitude,
		geometry: shapeById.get(row.id) ?? null,
		requestedControlActionId: row.requestedControlActionId,
		// Rebuilt from the projected columns rather than carried as a row: what
		// names a stop is a summary and a control type, and the request's other
		// thirty columns are not something this page reads.
		request:
			row.requestedControlActionId === null
				? null
				: {
						id: row.requestedControlActionId,
						summary: row.requestSummary,
						controlType: row.requestControlType ?? '',
					},
		addressId: row.addressId,
		addressLabel: address === undefined ? null : addressPrimaryLabel(address),
		progress: missionItemProgress(row),
		skipReason: row.skipReason,
		completedAt: row.completedAt,
		skippedAt: row.skippedAt,
		// A stop always has ground of its own, so this is only ever false for a row
		// whose centroid has not arrived.
		hasLocation: Number.isFinite(row.latitude) && Number.isFinite(row.longitude),
		isResolving: !linksReady && (row.requestedControlActionId !== null || row.addressId !== null),
	};
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
