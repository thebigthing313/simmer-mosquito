import { and, eq, inArray, isNull, useLiveQuery } from '@tanstack/react-db';
import { useMemo } from 'react';
import type { RouteStopFeature } from '../../../components/map';
import type { StopTone } from '../../../components/stop-order';
import type { AssignmentStatus, ProgressCounts } from '../../../hooks/queries/assignment-view';
import { assignmentStatus } from '../../../hooks/queries/assignment-view';
import { trapDisplayName } from '../../../hooks/queries/trap-view';
import { useProfileRoster } from '../../../hooks/queries/use-profile-roster';
import { addresses } from '../../../lib/collections/addresses';
import { assignment_items } from '../../../lib/collections/assignment_items';
import { assignments } from '../../../lib/collections/assignments';
import { collections } from '../../../lib/collections/collections';
import { habitats } from '../../../lib/collections/habitats';
import { route_items } from '../../../lib/collections/route_items';
import { service_requests } from '../../../lib/collections/service_requests';
import { traps } from '../../../lib/collections/traps';
import { type LifecycleOption, lifecycleOptions } from '../../../lib/lifecycle-options';

/**
 * The reads behind a worklist run, and the rules about what may be done to one.
 *
 * The writes used to live here too. They are in `hooks/mutations` now
 * (`use-assignment-mutations.ts`, `use-assignment-item-mutations.ts`), because
 * they no longer depend on anything this module knows: the endpoint reads a
 * named command rather than inferring one from which timestamp moved, so the
 * ordering rules that used to make a write dangerous — details and lifecycle
 * must never ride the same PATCH; Complete must never be offered on a skipped
 * stop — are enforced by the command's name.
 *
 * {@link itemActionsFor} is the one that survives, and it is a display rule now
 * rather than a safety one: Unskip before Complete is the honest order to offer
 * a crew, not a fence around an inference.
 *
 * What is left is composition — the stops joined to the records they send a crew
 * to — which is a page's question rather than a table's, and stays beside the
 * pages that ask it.
 */

// `assignments` and `assignment_items` are both on-demand shapes (docs/sync.md);
// hold a worklist's rows briefly after unmount so list → run → plan reuses them.
const assignmentsGcTimeMs = 30_000;

// A syntactically valid uuid that matches no row — keeps an `IN`/`eq` subset
// predicate live (and empty) while an id set is still unresolved.
const UNMATCHABLE_ID = '00000000-0000-0000-0000-000000000000';

/** Radix Select forbids an empty-string item value, so "nobody" needs a name. */
export const NO_ASSIGNEE = 'none';

// --- derived state ----------------------------------------------------------

export type ItemProgress = 'pending' | 'completed' | 'skipped';
export type TargetType = 'trap' | 'habitat' | 'serviceRequest';

/** Item progress. Skipped is checked first, matching the server's own precedence. */
export function itemProgress(row: {
	readonly completedAt: Date | string | null;
	readonly skippedAt: Date | string | null;
}): ItemProgress {
	if (row.skippedAt !== null) {
		return 'skipped';
	}
	return row.completedAt === null ? 'pending' : 'completed';
}

/**
 * The one place the polymorphic discriminator is interpreted.
 *
 * The column holds `service_request`; the vocabulary a page speaks is
 * `serviceRequest`. `trap` and `habitat` are single-word and identical either
 * way — which is exactly why an inline `=== 'serviceRequest'` comparison looks
 * correct until the first service-request stop appears.
 *
 * Both spellings are still accepted. The write side stamps the column's
 * (`use-assignment-item-mutations.ts`), so nothing this app produces is
 * camelCase any more, but a row written before that change still is.
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
 * Recording the work a stop was created for, which is a wider gate than
 * {@link canProgressItems}.
 *
 * Done and Skip are progress commands and need a started assignment. Recording
 * does not: `autoStartAssignment` defaults true precisely so a technician who
 * opens the first stop of the day and files the record has started the
 * assignment by doing so, and the server permits it (`checkExecution` allows
 * `not_started` on the auto-start path). Sharing the progress gate here made
 * that unreachable — the crew had to press Start first, which is the tap the
 * auto-start exists to remove. See `docs/field-work-support-domain.md`,
 * "Assignment Item Execution".
 */
export function canRecordStopWork(status: AssignmentStatus): boolean {
	return status === 'notStarted' || status === 'inProgress';
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
	readonly completedAt: Date | null;
	readonly completedByProfileId: string | null;
	readonly skippedAt: Date | null;
	readonly skippedByProfileId: string | null;
	readonly skipReason: string | null;
	readonly progress: ItemProgress;
	readonly target: AssignmentTarget | null;
	readonly hasLocation: boolean;
	/** The target row is still streaming. False with a null target means deleted. */
	readonly isResolving: boolean;
	/**
	 * On a trap stop, the collection already out on that trap, if there is one.
	 *
	 * Its presence is what makes this visit the *second* of a two-visit trap: the
	 * stop is here to empty a trap somebody set earlier, not to set a new one.
	 * Null on every other kind of stop and on a trap with nothing out.
	 */
	readonly pendingCollectionId: string | null;
}

/** An assignment as the run and plan pages read it. */
export interface AssignmentView {
	readonly id: string;
	readonly assignmentName: string | null;
	readonly assignmentDate: string;
	readonly assignedToProfileId: string | null;
	readonly dueAt: Date | null;
	readonly startedAt: Date | null;
	readonly completedAt: Date | null;
	readonly cancelledAt: Date | null;
	readonly cancellationReason: string | null;
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

// --- reads ------------------------------------------------------------------

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
					.from({ assignment: assignments() })
					.where(({ assignment }) => eq(assignment.id, assignmentId ?? UNMATCHABLE_ID))
					.select(({ assignment }) => ({
						id: assignment.id,
						assignmentName: assignment.assignment_name,
						assignmentDate: assignment.assignment_date,
						assignedToProfileId: assignment.assigned_to_profile_id,
						dueAt: assignment.due_at,
						startedAt: assignment.started_at,
						completedAt: assignment.completed_at,
						cancelledAt: assignment.cancelled_at,
						cancellationReason: assignment.cancellation_reason,
					})),
		},
		[assignmentId],
	);

	const row = result.data[0];

	return {
		assignment: row === undefined ? null : { ...row, status: assignmentStatus(row) },
		isLoading: assignmentId !== null && result.isLoading,
		isReady: result.isReady,
	};
}

/** One stop, in the vocabulary the run page speaks. */
interface AssignmentItemView {
	readonly id: string;
	readonly entityType: string;
	readonly entityId: string;
	readonly position: number;
	readonly directionsToNextItem: string | null;
	readonly completedAt: Date | null;
	readonly completedByProfileId: string | null;
	readonly skippedAt: Date | null;
	readonly skippedByProfileId: string | null;
	readonly skipReason: string | null;
}

/**
 * An assignment's items in sequence.
 *
 * Deliberately unfiltered by `entityType` — unlike a route, an assignment mixes
 * traps, habitats, and service requests in one worklist by design.
 */
export function useAssignmentItems(assignmentId: string | null): {
	readonly items: readonly AssignmentItemView[];
	readonly isLoading: boolean;
	readonly isReady: boolean;
} {
	const result = useLiveQuery(
		{
			gcTime: assignmentsGcTimeMs,
			query: (query) =>
				query
					.from({ item: assignment_items() })
					.where(({ item }) => eq(item.assignment_id, assignmentId ?? UNMATCHABLE_ID))
					.orderBy(({ item }) => item.position, 'asc')
					.select(({ item }) => ({
						id: item.id,
						entityType: item.entity_type,
						entityId: item.entity_id,
						position: item.position,
						directionsToNextItem: item.directions_to_next_item,
						completedAt: item.completed_at,
						completedByProfileId: item.completed_by_profile_id,
						skippedAt: item.skipped_at,
						skippedByProfileId: item.skipped_by_profile_id,
						skipReason: item.skip_reason,
					})),
		},
		[assignmentId],
	);

	return {
		items: result.data,
		isLoading: assignmentId !== null && result.isLoading,
		isReady: result.isReady,
	};
}

/**
 * Resolve every item's target record.
 *
 * One bounded subset per entity type, merged into a single map. Every query below
 * mounts unconditionally with an unmatchable-id fallback: a worklist made only of
 * traps would otherwise change the hook count between renders.
 *
 * The three are still separate reads rather than one join, and that is what the
 * polymorphism costs: `entity_id` points at a different table depending on
 * `entity_type`, so there is no column to join on.
 */
function useAssignmentTargets(items: readonly AssignmentItemView[]): {
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

	const trapKey = useMemo(() => [...trapIds].sort().join(','), [trapIds]);
	const habitatKey = useMemo(() => [...habitatIds].sort().join(','), [habitatIds]);
	const requestKey = useMemo(() => [...requestIds].sort().join(','), [requestIds]);

	// `traps` is eager, so this is a filter over rows already local rather than a
	// subset request — but asking for the stops' traps by id keeps the three
	// branches reading the same way.
	const trapResult = useLiveQuery(
		{
			gcTime: assignmentsGcTimeMs,
			query: (query) =>
				query
					.from({ trap: traps() })
					.where(({ trap }) => inArray(trap.id, trapIds.length > 0 ? trapIds : [UNMATCHABLE_ID]))
					.select(({ trap }) => ({
						id: trap.id,
						trapName: trap.trap_name,
						trapCode: trap.trap_code,
						description: trap.description,
						addressId: trap.address_id,
						lat: trap.lat,
						lng: trap.lng,
						isActive: trap.is_active,
					})),
		},
		[trapKey],
	);

	const habitatResult = useLiveQuery(
		{
			gcTime: assignmentsGcTimeMs,
			query: (query) =>
				query
					.from({ habitat: habitats() })
					.where(({ habitat }) =>
						inArray(habitat.id, habitatIds.length > 0 ? habitatIds : [UNMATCHABLE_ID]),
					)
					.select(({ habitat }) => ({
						id: habitat.id,
						habitatName: habitat.habitat_name,
						description: habitat.description,
						addressId: habitat.address_id,
						lat: habitat.lat,
						lng: habitat.lng,
						isActive: habitat.is_active,
						isInaccessible: habitat.is_inaccessible,
					})),
		},
		[habitatKey],
	);

	const requestResult = useLiveQuery(
		{
			gcTime: assignmentsGcTimeMs,
			query: (query) =>
				query
					.from({ request: service_requests() })
					.where(({ request }) =>
						inArray(request.id, requestIds.length > 0 ? requestIds : [UNMATCHABLE_ID]),
					)
					.select(({ request }) => ({
						id: request.id,
						addressId: request.address_id,
						details: request.details,
						lat: request.lat,
						lng: request.lng,
						closedAt: request.closed_at,
					})),
		},
		[requestKey],
	);

	const trapRows = trapResult.data;
	const habitatRows = habitatResult.data;
	const requestRows = requestResult.data;

	// Second-level subset: all three label themselves by address.
	const addressIds = useMemo(() => {
		const ids = new Set<string>();
		for (const habitat of habitatRows) {
			if (habitat.addressId !== null) {
				ids.add(habitat.addressId);
			}
		}
		for (const request of requestRows) {
			ids.add(request.addressId);
		}
		for (const trap of trapRows) {
			if (trap.addressId !== null) {
				ids.add(trap.addressId);
			}
		}
		return [...ids].sort();
	}, [habitatRows, requestRows, trapRows]);
	const addressKey = addressIds.join(',');

	const addressResult = useLiveQuery(
		{
			gcTime: assignmentsGcTimeMs,
			query: (query) =>
				query
					.from({ address: addresses() })
					.where(({ address }) =>
						inArray(address.id, addressIds.length > 0 ? addressIds : [UNMATCHABLE_ID]),
					)
					.select(({ address }) => ({ id: address.id, displayName: address.display_name })),
		},
		[addressKey],
	);

	const addressById = useMemo(() => {
		const map = new Map<string, string>();
		for (const address of addressResult.data) {
			map.set(address.id, address.displayName);
		}
		return map;
	}, [addressResult.data]);

	const byKey = useMemo(() => {
		const map = new Map<string, AssignmentTarget>();

		for (const trap of trapRows) {
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

		for (const habitat of habitatRows) {
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

		for (const request of requestRows) {
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
	}, [trapRows, habitatRows, requestRows, addressById]);

	return {
		byKey,
		isReady:
			trapResult.isReady && habitatResult.isReady && requestResult.isReady && addressResult.isReady,
	};
}

function targetKey(type: TargetType, id: string): string {
	return `${type}:${id}`;
}

/**
 * Traps on this worklist that already have a collection out on them.
 *
 * A trap stop means one of two visits — set the trap, or come back and empty
 * it — and only the data says which. The subset is keyed on the stops' own trap
 * ids rather than reading every collection, and the live query doubles as the
 * thing that keeps the on-demand collections stream warm: the Collect write
 * lands on this page, and a write to a cold stream times out waiting for its
 * txid.
 */
function usePendingTrapCollections(
	items: readonly AssignmentItemView[],
): ReadonlyMap<string, string> {
	const trapIds = useMemo(() => {
		const ids = new Set<string>();
		for (const item of items) {
			if (targetTypeOf(item.entityType) === 'trap') {
				ids.add(item.entityId);
			}
		}
		return [...ids].sort();
	}, [items]);
	const trapKey = trapIds.join(',');

	const result = useLiveQuery(
		{
			gcTime: assignmentsGcTimeMs,
			query: (query) =>
				query
					.from({ collection: collections() })
					.where(({ collection }) =>
						and(
							inArray(collection.trap_id, trapIds.length > 0 ? trapIds : [UNMATCHABLE_ID]),
							// The pending state, spelled out: a date-plus-duration collection
							// also has a null `collected_at` and is not waiting for anybody.
							// `isNull`, not `eq(…, null)` — the query builder follows SQL
							// three-valued logic, so an equality test against null matches
							// nothing and every trap stop silently looks like a first visit.
							isNull(collection.collected_at),
							eq(collection.collection_timing_mode, 'exact_timestamps'),
						),
					)
					.select(({ collection }) => ({ id: collection.id, trapId: collection.trap_id })),
		},
		[trapKey],
	);

	return useMemo(() => {
		const map = new Map<string, string>();
		for (const collection of result.data) {
			if (collection.trapId !== null && !map.has(collection.trapId)) {
				map.set(collection.trapId, collection.id);
			}
		}
		return map;
	}, [result.data]);
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
	const pendingByTrapId = usePendingTrapCollections(items);

	const stops = useMemo<readonly AssignmentStopView[]>(
		() =>
			items.map((item, index) => {
				const type = targetTypeOf(item.entityType);
				const target = type === null ? undefined : byKey.get(targetKey(type, item.entityId));
				const progress = itemProgress(item);
				return {
					pendingCollectionId:
						type === 'trap' ? (pendingByTrapId.get(item.entityId) ?? null) : null,
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
		[items, byKey, targetsReady, pendingByTrapId],
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
	const profiles = useProfileRoster();

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

/** One open service request, for the target picker. Closed requests take no new stops. */
export interface OpenServiceRequest {
	readonly id: string;
	readonly addressId: string;
	readonly details: string | null;
	readonly requestDate: string;
}

/**
 * Open service requests, for the target picker.
 *
 * No `organization_id` predicate: the shape is authorized and scoped server-side,
 * so a client-side tenant filter is redundant — and on a collection whose rows
 * carry the column but whose subset request does not accept it, it empties the
 * page instead.
 */
export function useOpenServiceRequests(): {
	readonly requests: readonly OpenServiceRequest[];
	readonly isReady: boolean;
} {
	const result = useLiveQuery(
		{
			gcTime: assignmentsGcTimeMs,
			query: (query) =>
				query
					.from({ request: service_requests() })
					.where(({ request }) => isNull(request.closed_at))
					.orderBy(({ request }) => request.request_date, 'desc')
					.select(({ request }) => ({
						id: request.id,
						addressId: request.address_id,
						details: request.details,
						requestDate: request.request_date,
					})),
		},
		[],
	);

	return { requests: result.data, isReady: result.isReady };
}

/** One route stop, as a from-route snapshot copies it. */
export interface RouteSnapshotItem {
	readonly routeItemId: string;
	readonly entityType: string;
	readonly entityId: string;
	readonly directionsToNextItem: string | null;
}

/**
 * A route's stops, in order — the source rows a from-route snapshot copies.
 *
 * The whole row rather than just the ids, because the create page draws the new
 * assignment's stops optimistically and a stop that does not know what it points
 * at cannot be drawn. The server still reads each target out of the Route; what
 * travels on the wire is only the id pairing.
 */
export function useRouteSnapshotItems(routeId: string | null): {
	readonly items: readonly RouteSnapshotItem[];
	readonly isReady: boolean;
} {
	const result = useLiveQuery(
		{
			gcTime: assignmentsGcTimeMs,
			query: (query) =>
				query
					.from({ item: route_items() })
					.where(({ item }) => eq(item.route_id, routeId ?? UNMATCHABLE_ID))
					.orderBy(({ item }) => item.position, 'asc')
					.select(({ item }) => ({
						routeItemId: item.id,
						entityType: item.entity_type,
						entityId: item.entity_id,
						directionsToNextItem: item.directions_to_next_item,
					})),
		},
		[routeId],
	);

	return {
		items: result.data,
		isReady: routeId === null ? true : result.isReady,
	};
}

/**
 * The controls a stop offers, in the order a crew should meet them.
 *
 * Unskip before Complete on a skipped stop. This used to be a safety rule: the
 * old PATCH resolved `skipped_at` before `completed_at`, so offering Complete on
 * a skipped stop produced a write that read as a skip and left the row looking
 * skipped until sync corrected it. The commands are named now, so Complete on a
 * skipped stop would be honoured — it is still not offered, because "unskip,
 * then work it" is the sequence that matches what actually happened in the
 * field.
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
