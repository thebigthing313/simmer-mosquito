import {
	checkedValues,
	geojsonToGeom,
	localDateColumn,
	type RawBuilder,
	softDelete,
	updateRow,
} from '@simmer-mosquito/db';
import type { MissionItemLocationSource } from '@simmer-mosquito/domain';
import { CommandError } from '../../command-endpoint.js';
import type { CommandTransaction } from '../../command-write.js';
import { loadOr404, resolveLocationGeom } from '../../location-source.js';
import type { CommandRow } from '../../return-columns.js';

export type MissionDispatchTransaction = CommandTransaction;
export { loadOr404, localDateColumn, softDelete, updateRow };

export async function insertMissionItem(
	trx: MissionDispatchTransaction,
	input: {
		readonly missionItemId: string;
		readonly organizationId: string;
		readonly missionId: string;
		readonly geom: ReturnType<typeof geojsonToGeom>;
		readonly addressId: string | null;
		readonly requestedControlActionId: string | null;
		readonly position: number;
		readonly actorProfileId: string;
	},
): Promise<void> {
	await trx
		.insertInto('mission_items')
		.values(
			await checkedValues(trx, input.organizationId, {
				id: input.missionItemId,
				organization_id: input.organizationId,
				mission_id: input.missionId,
				requested_control_action_id: input.requestedControlActionId,
				geom: input.geom,
				address_id: input.addressId,
				position: input.position,
				created_by_profile_id: input.actorProfileId,
				updated_by_profile_id: input.actorProfileId,
			}),
		)
		.execute();
}

// ===========================================================================
// Geometry resolution
// ===========================================================================

/**
 * Where a mission item's geometry comes from when the mission is created.
 *
 * Mission-specific, and so still here: an item either carries its own location
 * or inherits the requested control action's. Only the location-source arm is
 * shared, because that part is not this family's policy.
 */
export async function resolveInitialItemGeom(
	trx: MissionDispatchTransaction,
	organizationId: string,
	item: {
		readonly kind: 'explicit' | 'fromRequestedControlAction';
		readonly geometry?: unknown;
		readonly locationSource?: MissionItemLocationSource;
		readonly requestedControlActionId?: string | null;
	},
): Promise<RawBuilder<string>> {
	if (item.kind === 'fromRequestedControlAction') {
		return loadOr404(
			trx,
			'requested_control_actions',
			item.requestedControlActionId as string,
			organizationId,
		);
	}
	return resolveItemGeom(trx, organizationId, {
		geometry: item.geometry,
		locationSource: item.locationSource,
		requestedControlActionId: item.requestedControlActionId ?? null,
	});
}

export async function resolveItemGeom(
	trx: MissionDispatchTransaction,
	organizationId: string,
	input: {
		readonly geometry?: unknown;
		readonly locationSource?: MissionItemLocationSource | undefined;
		readonly requestedControlActionId?: string | null;
	},
): Promise<RawBuilder<string>> {
	if (input.geometry !== undefined) {
		return geojsonToGeom(input.geometry);
	}
	if (input.locationSource !== undefined) {
		return resolveLocationGeom(trx, organizationId, input.locationSource);
	}
	if (input.requestedControlActionId != null) {
		return loadOr404(
			trx,
			'requested_control_actions',
			input.requestedControlActionId,
			organizationId,
		);
	}
	throw new CommandError(400, { error: 'mission_item_location_required' });
}

// ===========================================================================
// Response shaping
// ===========================================================================

export type MissionRow = CommandRow<'missions'>;

export type MissionItemRow = CommandRow<'mission_items'>;
