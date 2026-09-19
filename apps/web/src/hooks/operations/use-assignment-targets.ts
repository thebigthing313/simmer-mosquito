import { inArray, useLiveQuery } from '@tanstack/react-db';
import type {
	AssignmentTarget,
	TargetType,
} from '../../components/operations/assignments/assignment-data';
import { targetTypeOf } from '../../components/operations/assignments/assignment-data';
import { addresses } from '../../lib/collections/addresses';
import { habitats } from '../../lib/collections/habitats';
import { service_requests } from '../../lib/collections/service_requests';
import { traps } from '../../lib/collections/traps';
import { activityGcTimeMs, unmatchableId } from '../queries/shared';
import { trapDisplayName } from '../queries/trap-view';
import type { AssignmentItemView } from './use-assignment-items';

/**
 * Every item's target record, keyed by `targetKey`, from one bounded subset
 * per entity type. Every query mounts unconditionally with an unmatchable-id
 * fallback.
 */
export function useAssignmentTargets(items: readonly AssignmentItemView[]): {
	readonly byKey: ReadonlyMap<string, AssignmentTarget>;
	readonly isReady: boolean;
} {
	const { trapIds, habitatIds, requestIds } = targetIdsByType(items);

	// `traps` is eager, so this is a filter over rows already local rather than a
	// subset request — but asking for the stops' traps by id keeps the three
	// branches reading the same way.
	const trapResult = useLiveQuery({
		gcTime: activityGcTimeMs,
		query: (query) =>
			query
				.from({ trap: traps() })
				.where(({ trap }) => inArray(trap.id, trapIds.length > 0 ? trapIds : [unmatchableId]))
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
	});

	const habitatResult = useLiveQuery({
		gcTime: activityGcTimeMs,
		query: (query) =>
			query
				.from({ habitat: habitats() })
				.where(({ habitat }) =>
					inArray(habitat.id, habitatIds.length > 0 ? habitatIds : [unmatchableId]),
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
	});

	const requestResult = useLiveQuery({
		gcTime: activityGcTimeMs,
		query: (query) =>
			query
				.from({ request: service_requests() })
				.where(({ request }) =>
					inArray(request.id, requestIds.length > 0 ? requestIds : [unmatchableId]),
				)
				.select(({ request }) => ({
					id: request.id,
					addressId: request.address_id,
					details: request.details,
					lat: request.lat,
					lng: request.lng,
					closedAt: request.closed_at,
				})),
	});

	const trapRows = trapResult.data;
	const habitatRows = habitatResult.data;
	const requestRows = requestResult.data;

	// Second-level subset: all three label themselves by address.
	const addressIds = addressIdsOf({ trapRows, habitatRows, requestRows });

	const addressResult = useLiveQuery({
		gcTime: activityGcTimeMs,
		query: (query) =>
			query
				.from({ address: addresses() })
				.where(({ address }) =>
					inArray(address.id, addressIds.length > 0 ? addressIds : [unmatchableId]),
				)
				.select(({ address }) => ({ id: address.id, displayName: address.display_name })),
	});

	const addressById = addressNamesById(addressResult.data);

	const byKey = targetsByKey({ trapRows, habitatRows, requestRows, addressById });

	return {
		byKey,
		isReady:
			trapResult.isReady && habitatResult.isReady && requestResult.isReady && addressResult.isReady,
	};
}

/** One trap row as the three subsets project it. */
interface TargetTrapRow {
	readonly id: string;
	readonly trapName: string | null;
	readonly trapCode: string | null;
	readonly description: string | null;
	readonly addressId: string | null;
	readonly lat: number | null;
	readonly lng: number | null;
	readonly isActive: boolean;
}

/** One habitat row as the three subsets project it. */
interface TargetHabitatRow {
	readonly id: string;
	readonly habitatName: string | null;
	readonly description: string | null;
	readonly addressId: string | null;
	readonly lat: number | null;
	readonly lng: number | null;
	readonly isActive: boolean;
	readonly isInaccessible: boolean;
}

/** One service request row as the three subsets project it. */
interface TargetRequestRow {
	readonly id: string;
	readonly addressId: string;
	readonly details: string | null;
	readonly lat: number | null;
	readonly lng: number | null;
	readonly closedAt: Date | null;
}

/** The stops' entity ids, split by the table each type points at. */
function targetIdsByType(items: readonly AssignmentItemView[]): {
	readonly trapIds: string[];
	readonly habitatIds: string[];
	readonly requestIds: string[];
} {
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
}

/** Every address the three row sets name, sorted so the subset key is stable. */
function addressIdsOf(rows: {
	readonly trapRows: readonly TargetTrapRow[];
	readonly habitatRows: readonly TargetHabitatRow[];
	readonly requestRows: readonly TargetRequestRow[];
}): string[] {
	const ids = new Set<string>();
	for (const habitat of rows.habitatRows) {
		if (habitat.addressId !== null) {
			ids.add(habitat.addressId);
		}
	}
	for (const request of rows.requestRows) {
		ids.add(request.addressId);
	}
	for (const trap of rows.trapRows) {
		if (trap.addressId !== null) {
			ids.add(trap.addressId);
		}
	}
	return [...ids].sort();
}

/** Address id → display name, over the rows the address subset returned. */
function addressNamesById(
	rows: readonly { readonly id: string; readonly displayName: string }[],
): ReadonlyMap<string, string> {
	const map = new Map<string, string>();
	for (const address of rows) {
		map.set(address.id, address.displayName);
	}
	return map;
}

/** The three row sets merged into the one map a stop looks its target up in. */
function targetsByKey(rows: {
	readonly trapRows: readonly TargetTrapRow[];
	readonly habitatRows: readonly TargetHabitatRow[];
	readonly requestRows: readonly TargetRequestRow[];
	readonly addressById: ReadonlyMap<string, string>;
}): ReadonlyMap<string, AssignmentTarget> {
	const { trapRows, habitatRows, requestRows, addressById } = rows;
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
}

export function targetKey(type: TargetType, id: string): string {
	return `${type}:${id}`;
}
