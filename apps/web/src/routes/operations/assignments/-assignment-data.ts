import type {
	AddressRow,
	AssignmentItemRow,
	AssignmentRow,
	HabitatRow,
	ProfileRow,
	ServiceRequestRow,
	TrapRow,
} from '@simmer-mosquito/sync';
import { and, eq, gte, inArray, lte, useLiveQuery } from '@tanstack/react-db';
import { useMemo } from 'react';
import type { RouteStopFeature } from '../../../components/map';
import type { StopTone } from '../../../components/stop-order';
import { useCollectionRows } from '../../../hooks/use-collection-rows';
import { type LifecycleOption, lifecycleOptions } from '../../../lib/lifecycle-options';
import { postCommand } from '../../../sync/post-command';
import { settleWrite } from '../../../sync/settle-write';
import { webCollections } from '../../../sync/webCollections';
import { trapDisplayName } from '../../adult-surveillance/-adult-display';

// `assignments` and `assignment_items` are both on-demand shapes (docs/sync.md);
// hold a worklist's rows briefly after unmount so list → run → plan reuses them.
const assignmentsGcTimeMs = 30_000;

// A syntactically valid uuid that matches no row — keeps an `IN`/`eq` subset
// predicate live (and empty) while an id set is still unresolved.
const UNMATCHABLE_ID = '00000000-0000-0000-0000-000000000000';

// The date analogue of UNMATCHABLE_ID. `dateParam` encodes "no bound" as an empty
// string, and comparing a date column against '' is not meaningfully total, so an
// unbounded filter gets a bound that every real date falls inside.
const EARLIEST_DATE = '0001-01-01';
const LATEST_DATE = '9999-12-31';

/**
 * Timestamps are validated against the *server's* clock with no tolerance, so a
 * client running even slightly fast has its lifecycle writes rejected as "in the
 * future" (see issue #37). Backdating by a couple of seconds costs nothing —
 * these are provenance timestamps, not measurements — and keeps a fast clock from
 * making the app unusable.
 */
const CLOCK_SKEW_MARGIN_MS = 2_000;

export function nowTimestamp(): string {
	return new Date(Date.now() - CLOCK_SKEW_MARGIN_MS).toISOString();
}

/** Radix Select forbids an empty-string item value, so "nobody" needs a name. */
export const NO_ASSIGNEE = 'none';

// --- derived state ----------------------------------------------------------

export type AssignmentStatus = 'notStarted' | 'inProgress' | 'completed' | 'cancelled';
export type ItemProgress = 'pending' | 'completed' | 'skipped';
export type TargetType = 'trap' | 'habitat' | 'serviceRequest';

/**
 * Assignment lifecycle, derived from timestamps — there is no status column.
 *
 * The precedence deliberately matches the server's `readLifecycleTransition`
 * rather than the intuitive reading, so a row that somehow carries two terminal
 * timestamps can never render as one state while PATCHing as another.
 */
export function assignmentStatus(
	row: Pick<AssignmentRow, 'startedAt' | 'completedAt' | 'cancelledAt'>,
): AssignmentStatus {
	if (row.completedAt !== null) {
		return 'completed';
	}
	if (row.cancelledAt !== null) {
		return 'cancelled';
	}
	return row.startedAt === null ? 'notStarted' : 'inProgress';
}

/** Item progress. Skipped is checked first, matching `readItemLifecycleTransition`. */
export function itemProgress(
	row: Pick<AssignmentItemRow, 'completedAt' | 'skippedAt'>,
): ItemProgress {
	if (row.skippedAt !== null) {
		return 'skipped';
	}
	return row.completedAt === null ? 'pending' : 'completed';
}

/**
 * The one place the polymorphic discriminator is interpreted.
 *
 * An optimistic row carries the camelCase type the command wire uses; the row that
 * syncs back carries the snake_case form the column stores. `trap` and `habitat`
 * are single-word and identical either way — only `serviceRequest` differs, which
 * is exactly why an inline `=== 'serviceRequest'` comparison looks correct until
 * the first service-request stop reloads.
 */
export function targetTypeOf(entityType: string): TargetType | null {
	switch (entityType) {
		case 'trap':
		case 'habitat':
			return entityType;
		case 'serviceRequest':
		case 'service_request':
			return 'serviceRequest';
		default:
			return null;
	}
}

export interface ProgressCounts {
	readonly total: number;
	readonly completed: number;
	readonly skipped: number;
	readonly pending: number;
	/** Completed or skipped — the two ways a stop is done being worked. */
	readonly handled: number;
}

export function progressCounts(
	items: readonly { readonly progress: ItemProgress }[],
): ProgressCounts {
	let completed = 0;
	let skipped = 0;
	for (const item of items) {
		if (item.progress === 'completed') {
			completed += 1;
		} else if (item.progress === 'skipped') {
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

export function canStartAssignment(status: AssignmentStatus, counts: ProgressCounts): boolean {
	return status === 'notStarted' && counts.total > 0;
}

export function canProgressItems(status: AssignmentStatus): boolean {
	return status === 'inProgress';
}

/**
 * The server does not enforce these preconditions (issue #39), so this is the only
 * thing standing between a mis-click and an assignment completed with pending work.
 */
export function canCompleteAssignment(status: AssignmentStatus, counts: ProgressCounts): boolean {
	return status === 'inProgress' && counts.total > 0 && counts.pending === 0;
}

export function canEditPlan(status: AssignmentStatus): boolean {
	return status === 'notStarted' || status === 'inProgress';
}

// --- view models ------------------------------------------------------------

export interface AssignmentTarget {
	readonly type: TargetType;
	readonly id: string;
	readonly name: string;
	readonly secondary: string | null;
	readonly lat: number | null;
	readonly lng: number | null;
	/** Active trap / active habitat / open request. Retired targets still display. */
	readonly isActive: boolean;
	readonly isInaccessible: boolean;
}

export interface AssignmentStopView {
	readonly assignmentItemId: string;
	/** 1-indexed place in the sequence, derived from `position` order at read time. */
	readonly ordinal: number;
	readonly position: number;
	readonly entityType: TargetType | null;
	readonly entityId: string;
	readonly directionsToNextItem: string | null;
	readonly completedAt: string | null;
	readonly completedByProfileId: string | null;
	readonly skippedAt: string | null;
	readonly skippedByProfileId: string | null;
	readonly skipReason: string | null;
	readonly progress: ItemProgress;
	readonly target: AssignmentTarget | null;
	readonly hasLocation: boolean;
	/** The target row is still streaming. False with a null target means deleted. */
	readonly isResolving: boolean;
}

export interface AssignmentView extends AssignmentRow {
	readonly status: AssignmentStatus;
}

/** Pin colour reports progress on the work, not the state of the site. */
export function assignmentStopTone(stop: AssignmentStopView): StopTone {
	if (stop.progress === 'skipped') {
		return 'skipped';
	}
	if (stop.progress === 'completed') {
		return 'done';
	}
	return 'default';
}

export function assignmentDisplayName(
	row: Pick<AssignmentRow, 'assignmentName' | 'assignmentDate'>,
	assigneeName: string | null,
): string {
	const name = row.assignmentName?.trim();
	if (name) {
		return name;
	}
	return assigneeName === null ? row.assignmentDate : `${row.assignmentDate} — ${assigneeName}`;
}

// --- reads ------------------------------------------------------------------

function toView(row: AssignmentRow): AssignmentView {
	return { ...row, status: assignmentStatus(row) };
}

/**
 * Assignments dated within `[from, to]`.
 *
 * Assignee and status are filtered by callers in memory rather than here: status
 * derives from three nullable timestamps and so is not one predicate, and the
 * assignee filter carries an "unassigned" pseudo-value that matches a null column.
 */
export function useAssignments(
	from: string,
	to: string,
): {
	readonly assignments: readonly AssignmentView[];
	readonly isLoading: boolean;
	readonly isReady: boolean;
} {
	const fromBound = from === '' ? EARLIEST_DATE : from;
	const toBound = to === '' ? LATEST_DATE : to;

	const result = useLiveQuery(
		{
			gcTime: assignmentsGcTimeMs,
			query: (query) =>
				query
					.from({ assignment: webCollections.assignments })
					.where(({ assignment }) =>
						and(gte(assignment.assignmentDate, fromBound), lte(assignment.assignmentDate, toBound)),
					)
					.orderBy(({ assignment }) => assignment.assignmentDate, 'desc'),
		},
		[fromBound, toBound],
	);

	const assignments = useMemo(
		() => ((result.data ?? []) as readonly AssignmentRow[]).map(toView),
		[result.data],
	);

	return { assignments, isLoading: result.isLoading, isReady: result.isReady };
}

/** One assignment. Also the warm-stream anchor on pages that write before reading. */
export function useAssignment(assignmentId: string | null): {
	readonly assignment: AssignmentView | null;
	readonly isLoading: boolean;
	readonly isReady: boolean;
} {
	const result = useLiveQuery(
		{
			gcTime: assignmentsGcTimeMs,
			query: (query) =>
				query
					.from({ assignment: webCollections.assignments })
					.where(({ assignment }) => eq(assignment.id, assignmentId ?? UNMATCHABLE_ID)),
		},
		[assignmentId],
	);

	const rows = (result.data ?? []) as readonly AssignmentRow[];
	const row = rows[0];

	return {
		assignment: row === undefined ? null : toView(row),
		isLoading: assignmentId !== null && result.isLoading,
		isReady: result.isReady,
	};
}

/**
 * An assignment's items in sequence.
 *
 * Deliberately unfiltered by `entityType` — unlike a route, an assignment mixes
 * traps, habitats, and service requests in one worklist by design.
 */
export function useAssignmentItems(assignmentId: string | null): {
	readonly items: readonly AssignmentItemRow[];
	readonly isLoading: boolean;
	readonly isReady: boolean;
} {
	const result = useLiveQuery(
		{
			gcTime: assignmentsGcTimeMs,
			query: (query) =>
				query
					.from({ item: webCollections.assignmentItems })
					.where(({ item }) => eq(item.assignmentId, assignmentId ?? UNMATCHABLE_ID))
					.orderBy(({ item }) => item.position, 'asc'),
		},
		[assignmentId],
	);

	return {
		items: (result.data ?? []) as readonly AssignmentItemRow[],
		isLoading: assignmentId !== null && result.isLoading,
		isReady: result.isReady,
	};
}

/** Per-assignment progress tallies, so the list can show "3 of 8" without drilling in. */
export function useAssignmentItemCounts(assignmentIds: readonly string[]): {
	readonly countsById: ReadonlyMap<string, ProgressCounts>;
	readonly isReady: boolean;
} {
	// Sorted + joined so a reordered id list doesn't re-run an identical query.
	const idsKey = useMemo(() => [...assignmentIds].sort().join(','), [assignmentIds]);
	const queryIds = assignmentIds.length > 0 ? [...assignmentIds] : [UNMATCHABLE_ID];

	const result = useLiveQuery(
		{
			gcTime: assignmentsGcTimeMs,
			query: (query) =>
				query
					.from({ item: webCollections.assignmentItems })
					.where(({ item }) => inArray(item.assignmentId, queryIds)),
		},
		[idsKey],
	);

	const countsById = useMemo(() => {
		const grouped = new Map<string, { progress: ItemProgress }[]>();
		for (const item of (result.data ?? []) as readonly AssignmentItemRow[]) {
			const bucket = grouped.get(item.assignmentId) ?? [];
			bucket.push({ progress: itemProgress(item) });
			grouped.set(item.assignmentId, bucket);
		}
		return new Map([...grouped].map(([id, items]) => [id, progressCounts(items)]));
	}, [result.data]);

	return { countsById, isReady: result.isReady };
}

/**
 * Resolve every item's target record.
 *
 * One bounded subset per entity type, merged into a single map. Every query below
 * mounts unconditionally with an unmatchable-id fallback: a worklist made only of
 * traps would otherwise change the hook count between renders.
 *
 * Traps are an eager collection, so they need no subset at all — the catalog is
 * already local and is filtered in memory.
 */
export function useAssignmentTargets(items: readonly AssignmentItemRow[]): {
	readonly byKey: ReadonlyMap<string, AssignmentTarget>;
	readonly isReady: boolean;
} {
	const { trapIds, habitatIds, requestIds } = useMemo(() => {
		const traps: string[] = [];
		const habitats: string[] = [];
		const requests: string[] = [];
		for (const item of items) {
			const type = targetTypeOf(item.entityType);
			if (type === 'trap') {
				traps.push(item.entityId);
			} else if (type === 'habitat') {
				habitats.push(item.entityId);
			} else if (type === 'serviceRequest') {
				requests.push(item.entityId);
			}
		}
		return { trapIds: traps, habitatIds: habitats, requestIds: requests };
	}, [items]);

	const habitatKey = useMemo(() => [...habitatIds].sort().join(','), [habitatIds]);
	const requestKey = useMemo(() => [...requestIds].sort().join(','), [requestIds]);

	const { rows: allTraps } = useCollectionRows<TrapRow>(webCollections.traps);

	const habitatResult = useLiveQuery(
		{
			gcTime: assignmentsGcTimeMs,
			query: (query) =>
				query
					.from({ habitat: webCollections.habitats })
					.where(({ habitat }) =>
						inArray(habitat.id, habitatIds.length > 0 ? habitatIds : [UNMATCHABLE_ID]),
					),
		},
		[habitatKey],
	);

	const requestResult = useLiveQuery(
		{
			gcTime: assignmentsGcTimeMs,
			query: (query) =>
				query
					.from({ request: webCollections.serviceRequests })
					.where(({ request }) =>
						inArray(request.id, requestIds.length > 0 ? requestIds : [UNMATCHABLE_ID]),
					),
		},
		[requestKey],
	);

	const habitats = (habitatResult.data ?? []) as readonly HabitatRow[];
	const requests = (requestResult.data ?? []) as readonly ServiceRequestRow[];

	// Second-level subset: habitats and requests both label themselves by address.
	const addressIds = useMemo(() => {
		const ids = new Set<string>();
		for (const habitat of habitats) {
			if (habitat.addressId !== null) {
				ids.add(habitat.addressId);
			}
		}
		for (const request of requests) {
			ids.add(request.addressId);
		}
		for (const trap of allTraps) {
			if (trapIds.includes(trap.id) && trap.addressId !== null) {
				ids.add(trap.addressId);
			}
		}
		return [...ids].sort();
	}, [habitats, requests, allTraps, trapIds]);
	const addressKey = addressIds.join(',');

	const addressResult = useLiveQuery(
		{
			gcTime: assignmentsGcTimeMs,
			query: (query) =>
				query
					.from({ address: webCollections.addresses })
					.where(({ address }) =>
						inArray(address.id, addressIds.length > 0 ? addressIds : [UNMATCHABLE_ID]),
					),
		},
		[addressKey],
	);

	const addressById = useMemo(() => {
		const map = new Map<string, string>();
		for (const address of (addressResult.data ?? []) as readonly AddressRow[]) {
			map.set(address.id, address.displayName);
		}
		return map;
	}, [addressResult.data]);

	const byKey = useMemo(() => {
		const map = new Map<string, AssignmentTarget>();
		const wanted = new Set(trapIds);

		for (const trap of allTraps) {
			if (!wanted.has(trap.id)) {
				continue;
			}
			map.set(targetKey('trap', trap.id), {
				type: 'trap',
				id: trap.id,
				name: trapDisplayName(trap),
				secondary:
					trap.addressId === null ? trap.description : (addressById.get(trap.addressId) ?? null),
				lat: trap.lat,
				lng: trap.lng,
				isActive: trap.isActive,
				isInaccessible: false,
			});
		}

		for (const habitat of habitats) {
			map.set(targetKey('habitat', habitat.id), {
				type: 'habitat',
				id: habitat.id,
				name: habitat.habitatName?.trim() || `Habitat ${habitat.id.slice(0, 8)}`,
				secondary:
					habitat.addressId === null
						? habitat.description
						: (addressById.get(habitat.addressId) ?? null),
				lat: habitat.lat,
				lng: habitat.lng,
				isActive: habitat.isActive,
				isInaccessible: habitat.isInaccessible,
			});
		}

		for (const request of requests) {
			map.set(targetKey('serviceRequest', request.id), {
				type: 'serviceRequest',
				id: request.id,
				name: addressById.get(request.addressId) ?? `Request ${request.id.slice(0, 8)}`,
				secondary: request.details,
				lat: request.lat,
				lng: request.lng,
				isActive: request.closedAt === null,
				isInaccessible: false,
			});
		}

		return map;
	}, [allTraps, trapIds, habitats, requests, addressById]);

	return {
		byKey,
		isReady: habitatResult.isReady && requestResult.isReady && addressResult.isReady,
	};
}

function targetKey(type: TargetType, id: string): string {
	return `${type}:${id}`;
}

/** An assignment's stops, joined to their targets and ready to render or map. */
export function useAssignmentStops(assignmentId: string | null): {
	readonly stops: readonly AssignmentStopView[];
	readonly features: readonly RouteStopFeature[];
	readonly counts: ProgressCounts;
	readonly isLoading: boolean;
} {
	const { items, isLoading: itemsLoading } = useAssignmentItems(assignmentId);
	const { byKey, isReady: targetsReady } = useAssignmentTargets(items);

	const stops = useMemo<readonly AssignmentStopView[]>(
		() =>
			items.map((item, index) => {
				const type = targetTypeOf(item.entityType);
				const target = type === null ? undefined : byKey.get(targetKey(type, item.entityId));
				const progress = itemProgress(item);
				return {
					assignmentItemId: item.id,
					ordinal: index + 1,
					position: item.position,
					entityType: type,
					entityId: item.entityId,
					directionsToNextItem: item.directionsToNextItem,
					completedAt: item.completedAt,
					completedByProfileId: item.completedByProfileId,
					skippedAt: item.skippedAt,
					skippedByProfileId: item.skippedByProfileId,
					skipReason: item.skipReason,
					progress,
					target: target ?? null,
					hasLocation: target?.lat != null && target?.lng != null,
					isResolving: target === undefined && !targetsReady,
				};
			}),
		[items, byKey, targetsReady],
	);

	const features = useMemo<RouteStopFeature[]>(
		() =>
			stops
				.filter((stop) => stop.hasLocation)
				.map((stop) => ({
					id: stop.assignmentItemId,
					lng: stop.target?.lng as number,
					lat: stop.target?.lat as number,
					ordinal: stop.ordinal,
					tone: assignmentStopTone(stop),
				})),
		[stops],
	);

	return {
		stops,
		features,
		counts: progressCounts(stops),
		isLoading: itemsLoading,
	};
}

/** Assignee choices, with "Unassigned" first — planning drafts may carry nobody. */
export function useAssigneeOptions(): {
	readonly options: readonly LifecycleOption[];
	readonly nameById: ReadonlyMap<string, string>;
} {
	const { rows: profiles } = useCollectionRows<ProfileRow>(webCollections.profiles);

	return useMemo(
		() => ({
			options: [
				{ label: 'Unassigned', value: NO_ASSIGNEE },
				...lifecycleOptions(
					profiles,
					(profile) => profile.isActive,
					(profile) => profile.displayName,
				),
			],
			nameById: new Map(profiles.map((profile) => [profile.id, profile.displayName])),
		}),
		[profiles],
	);
}

/** Open service requests, for the target picker. Closed requests take no new stops. */
export function useOpenServiceRequests(organizationId: string): {
	readonly requests: readonly ServiceRequestRow[];
	readonly isReady: boolean;
} {
	const result = useLiveQuery(
		{
			gcTime: assignmentsGcTimeMs,
			query: (query) =>
				query
					.from({ request: webCollections.serviceRequests })
					.where(({ request }) => eq(request.organizationId, organizationId))
					.orderBy(({ request }) => request.requestDate, 'desc'),
		},
		[organizationId],
	);

	const requests = useMemo(
		() =>
			((result.data ?? []) as readonly ServiceRequestRow[]).filter(
				(request) => request.closedAt === null,
			),
		[result.data],
	);

	return { requests, isReady: result.isReady };
}

/** A route's stops, in order — the source rows a from-route snapshot copies. */
export function useRouteSnapshotItems(routeId: string | null): {
	readonly items: readonly { readonly id: string; readonly entityType: string }[];
	readonly isReady: boolean;
} {
	const result = useLiveQuery(
		{
			gcTime: assignmentsGcTimeMs,
			query: (query) =>
				query
					.from({ item: webCollections.routeItems })
					.where(({ item }) => eq(item.routeId, routeId ?? UNMATCHABLE_ID))
					.orderBy(({ item }) => item.position, 'asc'),
		},
		[routeId],
	);

	return {
		items: (result.data ?? []) as readonly { id: string; entityType: string }[],
		isReady: routeId === null ? true : result.isReady,
	};
}

// --- writes -----------------------------------------------------------------

type MutableAssignmentRow = { -readonly [Key in keyof AssignmentRow]: AssignmentRow[Key] };
type MutableAssignmentItemRow = {
	-readonly [Key in keyof AssignmentItemRow]: AssignmentItemRow[Key];
};

/**
 * Every write below is a plain collection update, because the PATCH handlers
 * derive their command from *which* fields changed rather than from a verb in
 * the body. Two consequences worth knowing before adding one:
 *
 * 1. Details and lifecycle must never ride the same update. One PATCH body
 *    builds both command families, so an edit form that "normalises"
 *    `completedAt` back to null while saving a name would silently reopen the
 *    assignment.
 * 2. A field is only sent when it actually changes, so writing the value a row
 *    already holds is a no-op rather than a redundant command — which is why
 *    each helper can null every field its transition owns without worrying
 *    about the ones already null.
 */

/** The planning fields. Deliberately touches no lifecycle timestamp. */
export async function updateAssignmentDetails(
	assignmentId: string,
	changes: {
		readonly assignmentName: string | null;
		readonly assignmentDate: string;
		readonly assignedToProfileId: string | null;
		readonly dueAt: string | null;
	},
): Promise<void> {
	await settleWrite(
		webCollections.assignments.update(assignmentId, (draft) => {
			const mutable = draft as MutableAssignmentRow;
			mutable.assignmentName = changes.assignmentName;
			mutable.assignmentDate = changes.assignmentDate;
			mutable.assignedToProfileId = changes.assignedToProfileId;
			mutable.dueAt = changes.dueAt;
		}),
	);
}

export async function startAssignment(assignmentId: string): Promise<void> {
	await settleWrite(
		webCollections.assignments.update(assignmentId, (draft) => {
			(draft as MutableAssignmentRow).startedAt = nowTimestamp();
		}),
	);
}

export async function completeAssignment(assignmentId: string): Promise<void> {
	await settleWrite(
		webCollections.assignments.update(assignmentId, (draft) => {
			(draft as MutableAssignmentRow).completedAt = nowTimestamp();
		}),
	);
}

/** Cancelling carries its reason in the same draft, so one PATCH holds both. */
export async function cancelAssignment(
	assignmentId: string,
	cancellationReason: string | null,
): Promise<void> {
	await settleWrite(
		webCollections.assignments.update(assignmentId, (draft) => {
			const mutable = draft as MutableAssignmentRow;
			mutable.cancelledAt = nowTimestamp();
			mutable.cancellationReason = cancellationReason;
		}),
	);
}

/**
 * Reopen a closed assignment.
 *
 * `startedAt` is deliberately left alone: the server keeps it (issue #38), since
 * reopening resumes work rather than resetting it and nothing else on the row
 * records when the crew actually started. Nulling it here would show
 * "Not started" until sync corrected the row back.
 */
export async function reopenAssignment(assignmentId: string): Promise<void> {
	await settleWrite(
		webCollections.assignments.update(assignmentId, (draft) => {
			const mutable = draft as MutableAssignmentRow;
			mutable.completedAt = null;
			mutable.cancelledAt = null;
			mutable.cancellationReason = null;
		}),
	);
}

/** Append a stop. `entityType` is written camelCase — see {@link targetTypeOf}. */
export async function addAssignmentItem(input: {
	readonly assignmentItemId: string;
	readonly assignmentId: string;
	readonly organizationId: string;
	readonly actorProfileId: string | null;
	readonly target: { readonly type: TargetType; readonly id: string };
	readonly position: number;
}): Promise<void> {
	const now = new Date().toISOString();
	const row: AssignmentItemRow = {
		id: input.assignmentItemId,
		organizationId: input.organizationId,
		assignmentId: input.assignmentId,
		entityType: input.target.type,
		entityId: input.target.id,
		position: input.position,
		directionsToNextItem: null,
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
	await settleWrite(webCollections.assignmentItems.insert(row));
}

export async function removeAssignmentItem(assignmentItemId: string): Promise<void> {
	await settleWrite(webCollections.assignmentItems.delete(assignmentItemId));
}

export async function updateAssignmentItemDirections(
	assignmentItemId: string,
	directions: string,
): Promise<void> {
	const trimmed = directions.trim();
	await settleWrite(
		webCollections.assignmentItems.update(assignmentItemId, (draft) => {
			(draft as MutableAssignmentItemRow).directionsToNextItem =
				trimmed.length === 0 ? null : trimmed;
		}),
	);
}

/**
 * Item progress.
 *
 * The `*ByProfileId` columns are mirrored optimistically so a row does not
 * flicker between what the page wrote and what the server stamped. They are not
 * patch keys, so they never reach the wire — the server sets them from the
 * authenticated actor.
 */
export async function completeAssignmentItem(
	assignmentItemId: string,
	actorProfileId: string | null,
): Promise<void> {
	await settleWrite(
		webCollections.assignmentItems.update(assignmentItemId, (draft) => {
			const mutable = draft as MutableAssignmentItemRow;
			mutable.completedAt = nowTimestamp();
			mutable.completedByProfileId = actorProfileId;
		}),
	);
}

export async function skipAssignmentItem(
	assignmentItemId: string,
	skipReason: string,
	actorProfileId: string | null,
): Promise<void> {
	await settleWrite(
		webCollections.assignmentItems.update(assignmentItemId, (draft) => {
			const mutable = draft as MutableAssignmentItemRow;
			mutable.skippedAt = nowTimestamp();
			mutable.skipReason = skipReason;
			mutable.skippedByProfileId = actorProfileId;
		}),
	);
}

export async function unskipAssignmentItem(assignmentItemId: string): Promise<void> {
	await settleWrite(
		webCollections.assignmentItems.update(assignmentItemId, (draft) => {
			const mutable = draft as MutableAssignmentItemRow;
			mutable.skippedAt = null;
			mutable.skipReason = null;
			mutable.skippedByProfileId = null;
		}),
	);
}

export async function reopenAssignmentItem(assignmentItemId: string): Promise<void> {
	await settleWrite(
		webCollections.assignmentItems.update(assignmentItemId, (draft) => {
			const mutable = draft as MutableAssignmentItemRow;
			mutable.completedAt = null;
			mutable.completedByProfileId = null;
		}),
	);
}

/**
 * The controls a stop offers, in the order the server would resolve them.
 *
 * `readItemLifecycleTransition` checks `skippedAt` before `completedAt`, so a
 * skipped stop must never be offered Complete: the PATCH would be read as a
 * skip-then-complete and the row would keep reading as skipped until sync
 * corrected the optimistic value. Unskip first is the only legal path.
 */
export function itemActionsFor(progress: ItemProgress): readonly ItemAction[] {
	if (progress === 'skipped') {
		return ['unskip'];
	}
	if (progress === 'completed') {
		return ['reopen'];
	}
	return ['complete', 'skip'];
}

export type ItemAction = 'complete' | 'skip' | 'unskip' | 'reopen';

/**
 * Snapshot a route's stops into a new assignment.
 *
 * Compound (one assignment plus N items in a single transaction), so it goes
 * straight to its command endpoint rather than through a collection mutation.
 *
 * The server copies only route items that appear in `assignmentItemIds` — the
 * mapping is both the id source and the membership filter — so a mapping built
 * from a subset that has not finished loading yields a silently short assignment.
 * Callers must gate on the route items being ready.
 */
export async function createAssignmentFromRoute(input: {
	readonly assignmentId: string;
	readonly routeId: string;
	readonly assignmentDate: string;
	readonly assignmentName: string | null;
	readonly assignedToProfileId: string | null;
	readonly dueAt: string | null;
	readonly assignmentItemIds: readonly {
		readonly routeItemId: string;
		readonly assignmentItemId: string;
	}[];
}): Promise<void> {
	await postCommand(
		'/field-work/assignments/from-route',
		{
			id: input.assignmentId,
			routeId: input.routeId,
			assignmentDate: input.assignmentDate,
			assignmentName: input.assignmentName,
			assignedToProfileId: input.assignedToProfileId,
			dueAt: input.dueAt,
			assignmentItemIds: [...input.assignmentItemIds],
		},
		'Unable to create the assignment from that route.',
	);
}

/**
 * Reorder stops server-side.
 *
 * The shared planner names the anchor `anchorId`; this endpoint calls it
 * `assignmentItemId`. Translating here keeps the wire vocabulary in the module
 * that owns it.
 */
export async function moveAssignmentItems(
	assignmentId: string,
	assignmentItemIds: readonly string[],
	placement:
		| { readonly kind: 'start' }
		| { readonly kind: 'end' }
		| { readonly kind: 'before'; readonly anchorId: string }
		| { readonly kind: 'after'; readonly anchorId: string },
): Promise<void> {
	const wirePlacement =
		placement.kind === 'before' || placement.kind === 'after'
			? { kind: placement.kind, assignmentItemId: placement.anchorId }
			: placement;
	await postCommand(
		`/field-work/assignments/${assignmentId}/move-items`,
		{ assignmentItemIds: [...assignmentItemIds], placement: wirePlacement },
		'Unable to reorder the assignment.',
	);
}
