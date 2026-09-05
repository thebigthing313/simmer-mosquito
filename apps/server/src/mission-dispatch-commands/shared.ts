import {
	checkedValues,
	geojsonToGeom,
	localDateColumn,
	type RawBuilder,
	type SelectedRow,
	softDelete,
	updateRow,
} from '@simmer-mosquito/db';
import type { MissionDispatchCommand, MissionItemLocationSource } from '@simmer-mosquito/domain';
import type { MiddlewareHandler } from 'hono';
import type { AuthVariables } from '../auth-middleware.js';
import {
	type CommandContext,
	CommandError,
	commandEndpoint,
	createCommand,
	invalidUpdate,
	organizationCommandContext,
	type CommandsResult as SharedCommandsResult,
} from '../command-endpoint.js';
import {
	type CommandDb,
	type CommandTransaction,
	readDate,
	readStringArray,
	runCommands,
} from '../command-write.js';
import { loadOr404, resolveLocationGeom } from '../location-source.js';

export type MissionDispatchDb = CommandDb;
export type MissionDispatchTransaction = CommandTransaction;
export {
	type CommandContext,
	commandEndpoint,
	createCommand,
	invalidUpdate,
	loadOr404,
	localDateColumn,
	organizationCommandContext,
	readDate,
	readStringArray,
	runCommands,
	softDelete,
	updateRow,
};

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
// Lifecycle transition derivation
// ===========================================================================

export type MissionLifecycle = 'start' | 'complete' | 'cancel' | 'reopen' | null;

export function readLifecycleTransition(payload: Record<string, unknown>): MissionLifecycle {
	if ('completedAt' in payload && payload.completedAt !== null) {
		return 'complete';
	}
	if ('cancelledAt' in payload && payload.cancelledAt !== null) {
		return 'cancel';
	}
	if ('startedAt' in payload && payload.startedAt !== null) {
		return 'start';
	}
	if (
		('completedAt' in payload && payload.completedAt === null) ||
		('cancelledAt' in payload && payload.cancelledAt === null) ||
		('startedAt' in payload && payload.startedAt === null)
	) {
		return 'reopen';
	}
	return null;
}

export type ItemLifecycle = 'complete' | 'skip' | 'reopen' | 'unskip' | null;

export function readItemLifecycleTransition(payload: Record<string, unknown>): ItemLifecycle {
	if ('skippedAt' in payload && payload.skippedAt !== null) {
		return 'skip';
	}
	if ('completedAt' in payload && payload.completedAt !== null) {
		return 'complete';
	}
	if ('skippedAt' in payload && payload.skippedAt === null) {
		return 'unskip';
	}
	if ('completedAt' in payload && payload.completedAt === null) {
		return 'reopen';
	}
	return null;
}

// ===========================================================================
// Response shaping
// ===========================================================================

export const missionReturnColumns = [
	'id',
	'organization_id',
	'mission_name',
	'control_type',
	'planned_method_id',
	'assigned_to_profile_id',
	'scheduled_start_at',
	'scheduled_end_at',
	'started_at',
	'completed_at',
	'cancelled_at',
	'notification_type_id',
	'created_at',
	'updated_at',
] as const;

export type MissionRow = SelectedRow<'missions', typeof missionReturnColumns>;

export const missionItemReturnColumns = [
	'id',
	'organization_id',
	'mission_id',
	'requested_control_action_id',
	'address_id',
	'position',
	'completed_at',
	'skipped_at',
	'skip_reason',
	'created_at',
	'updated_at',
] as const;

export type MissionItemRow = SelectedRow<'mission_items', typeof missionItemReturnColumns>;

// ===========================================================================
// Shared command + request helpers
// ===========================================================================

export interface RouteOptions {
	readonly db: MissionDispatchDb;
	readonly authContextMiddleware: MiddlewareHandler<{ Variables: AuthVariables }>;
}

export type CommandsResult = SharedCommandsResult<MissionDispatchCommand>;

// ===========================================================================
// Authorization
// ===========================================================================
