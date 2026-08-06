import {
	type Kysely,
	type MutationWriteResult,
	type SimmerDatabase,
	sql,
	type Transaction,
} from '@simmer-mosquito/db';
import type { MissionDispatchCommand } from '@simmer-mosquito/domain';
import type { MiddlewareHandler } from 'hono';
import type { AuthContext } from '../auth-context.js';
import type { AuthVariables } from '../auth-middleware.js';
import {
	agencyCommandContext,
	type CommandContext,
	CommandError,
	commandEndpoint,
	createCommand,
	handleCommandError,
	invalidUpdate,
	type CommandsResult as SharedCommandsResult,
} from '../command-endpoint.js';
import { resolveCommandOwnership } from '../command-ownership.js';
import { authorizeCommands, type CommandActor } from '../command-permissions.js';

export type MissionDispatchDb = Kysely<SimmerDatabase>;
export type MissionDispatchTransaction = Transaction<SimmerDatabase>;
export {
	agencyCommandContext,
	type CommandContext,
	commandEndpoint,
	createCommand,
	handleCommandError,
	invalidUpdate,
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
		.values({
			id: input.missionItemId,
			organization_id: input.organizationId,
			mission_id: input.missionId,
			requested_control_action_id: input.requestedControlActionId,
			geom: input.geom,
			address_id: input.addressId,
			position: input.position,
			created_by_profile_id: input.actorProfileId,
			updated_by_profile_id: input.actorProfileId,
		})
		.execute();
}

// ===========================================================================
// Geometry resolution
// ===========================================================================

export type GeomTable =
	| 'addresses'
	| 'habitats'
	| 'inspections'
	| 'traps'
	| 'collections'
	| 'service_requests'
	| 'requested_control_actions';

export async function resolveInitialItemGeom(
	trx: MissionDispatchTransaction,
	organizationId: string,
	item: {
		readonly kind: 'explicit' | 'fromRequestedControlAction';
		readonly geometry?: unknown;
		readonly locationSource?: { readonly kind: string } & Record<string, unknown>;
		readonly requestedControlActionId?: string | null;
	},
): Promise<ReturnType<typeof geojsonToGeom>> {
	if (item.kind === 'fromRequestedControlAction') {
		return geojsonToGeom(
			await loadGeojson(
				trx,
				'requested_control_actions',
				item.requestedControlActionId as string,
				organizationId,
			),
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
		readonly locationSource?: ({ readonly kind: string } & Record<string, unknown>) | undefined;
		readonly requestedControlActionId?: string | null;
	},
): Promise<ReturnType<typeof geojsonToGeom>> {
	if (input.geometry !== undefined) {
		return geojsonToGeom(input.geometry);
	}
	if (input.locationSource !== undefined) {
		return resolveLocationSourceGeom(trx, organizationId, input.locationSource);
	}
	if (input.requestedControlActionId != null) {
		return geojsonToGeom(
			await loadGeojson(
				trx,
				'requested_control_actions',
				input.requestedControlActionId,
				organizationId,
			),
		);
	}
	throw new CommandError(400, { error: 'mission_item_location_required' });
}

async function resolveLocationSourceGeom(
	trx: MissionDispatchTransaction,
	organizationId: string,
	source: { readonly kind: string } & Record<string, unknown>,
): Promise<ReturnType<typeof geojsonToGeom>> {
	switch (source.kind) {
		case 'geometry':
			return geojsonToGeom(source.geometry);
		case 'address':
			return geojsonToGeom(
				await loadGeojson(trx, 'addresses', source.addressId as string, organizationId),
			);
		case 'habitat':
			return geojsonToGeom(
				await loadGeojson(trx, 'habitats', source.habitatId as string, organizationId),
			);
		case 'inspection':
			return geojsonToGeom(
				await loadGeojson(trx, 'inspections', source.inspectionId as string, organizationId),
			);
		case 'trap':
			return geojsonToGeom(
				await loadGeojson(trx, 'traps', source.trapId as string, organizationId),
			);
		case 'collection':
			return geojsonToGeom(
				await loadGeojson(trx, 'collections', source.collectionId as string, organizationId),
			);
		case 'serviceRequest':
			return geojsonToGeom(
				await loadGeojson(
					trx,
					'service_requests',
					source.serviceRequestId as string,
					organizationId,
				),
			);
		case 'requestedControlAction':
			return geojsonToGeom(
				await loadGeojson(
					trx,
					'requested_control_actions',
					source.requestedControlActionId as string,
					organizationId,
				),
			);
		default:
			throw new CommandError(400, { error: 'unsupported_location_source' });
	}
}

export async function loadGeojson(
	trx: MissionDispatchTransaction,
	table: GeomTable,
	id: string,
	organizationId: string,
): Promise<unknown> {
	const row = await trx
		.selectFrom(table)
		.select('geojson')
		.where('id', '=', id)
		.where('organization_id', '=', organizationId)
		.where('deleted_at', 'is', null)
		.executeTakeFirst();
	if (row === undefined) {
		throw new CommandError(404, { error: `${table}_not_found` });
	}
	return row.geojson;
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
// Generic row helpers
// ===========================================================================

export async function updateRow<TRow, TSafe>(
	trx: MissionDispatchTransaction,
	table: 'missions' | 'mission_items',
	id: string,
	organizationId: string,
	set: Record<string, unknown>,
	columns: readonly string[],
	toSafe: (row: TRow) => TSafe,
): Promise<TSafe | null> {
	const row = await trx
		.updateTable(table)
		.set({ ...set, updated_at: sql`now()` } as never)
		.where('id', '=', id)
		.where('organization_id', '=', organizationId)
		.where('deleted_at', 'is', null)
		.returning(columns as never)
		.executeTakeFirst();
	return row === undefined ? null : toSafe(row as TRow);
}

export async function softDelete<TRow, TSafe>(
	trx: MissionDispatchTransaction,
	table: 'missions' | 'mission_items',
	id: string,
	organizationId: string,
	actorProfileId: string,
	columns: readonly string[],
	toSafe: (row: TRow) => TSafe,
): Promise<TSafe | null> {
	const row = await trx
		.updateTable(table)
		.set({
			deleted_at: sql`now()`,
			deleted_by_profile_id: actorProfileId,
			updated_by_profile_id: actorProfileId,
			updated_at: sql`now()`,
		} as never)
		.where('id', '=', id)
		.where('organization_id', '=', organizationId)
		.where('deleted_at', 'is', null)
		.returning(columns as never)
		.executeTakeFirst();
	return row === undefined ? null : toSafe(row as TRow);
}

/**
 * The write transaction every mission-dispatch endpoint commits through.
 *
 * `actor` is required rather than optional so ownership cannot be skipped by
 * omission: every command is checked against the permission map before its
 * handler runs, and a caller that has no actor to pass cannot compile.
 */
export async function writeCommands<TSafe>(
	db: MissionDispatchDb,
	actor: CommandActor,
	commands: readonly MissionDispatchCommand[],
	write: (
		trx: MissionDispatchTransaction,
		command: MissionDispatchCommand,
	) => Promise<TSafe | null>,
): Promise<MutationWriteResult<TSafe | null>> {
	return db.transaction().execute(async (trx) => {
		let row: TSafe | null = null;
		for (const command of commands) {
			await assertCommandOwnership(trx, command, actor);
			row = await write(trx, command);
		}
		return { row, txid: await readCurrentTransactionId(trx) };
	});
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

export interface SafeMission {
	readonly id: string;
	readonly organizationId: string;
	readonly missionName: string | null;
	readonly controlType: string;
	readonly startedAt: Date | null;
	readonly completedAt: Date | null;
	readonly cancelledAt: Date | null;
	readonly createdAt: Date;
	readonly updatedAt: Date;
}

export function toSafeMission(row: {
	readonly id: string;
	readonly organization_id: string;
	readonly mission_name: string | null;
	readonly control_type: string;
	readonly started_at: Date | null;
	readonly completed_at: Date | null;
	readonly cancelled_at: Date | null;
	readonly created_at: Date;
	readonly updated_at: Date;
}): SafeMission {
	return {
		id: row.id,
		organizationId: row.organization_id,
		missionName: row.mission_name,
		controlType: row.control_type,
		startedAt: row.started_at,
		completedAt: row.completed_at,
		cancelledAt: row.cancelled_at,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

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

export interface SafeMissionItem {
	readonly id: string;
	readonly organizationId: string;
	readonly missionId: string;
	readonly requestedControlActionId: string | null;
	readonly addressId: string | null;
	readonly position: number;
	readonly completedAt: Date | null;
	readonly skippedAt: Date | null;
	readonly createdAt: Date;
	readonly updatedAt: Date;
}

export function toSafeMissionItem(row: {
	readonly id: string;
	readonly organization_id: string;
	readonly mission_id: string;
	readonly requested_control_action_id: string | null;
	readonly address_id: string | null;
	readonly position: number;
	readonly completed_at: Date | null;
	readonly skipped_at: Date | null;
	readonly created_at: Date;
	readonly updated_at: Date;
}): SafeMissionItem {
	return {
		id: row.id,
		organizationId: row.organization_id,
		missionId: row.mission_id,
		requestedControlActionId: row.requested_control_action_id,
		addressId: row.address_id,
		position: row.position,
		completedAt: row.completed_at,
		skippedAt: row.skipped_at,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

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

export type { CommandActor };

export function commandActor(authContext: AuthContext): CommandActor {
	return { role: authContext.role, profileId: authContext.profile.id };
}

/**
 * The role check every mission-dispatch endpoint runs before writing.
 *
 * Collectors execute missions; they do not create, edit, cancel, reopen, or
 * delete them, and viewers are read-only. Ownership rules — "their assigned
 * mission" — are settled in the write transaction.
 */
export function denyUnauthorizedCommands(
	context: CommandContext,
	commands: readonly MissionDispatchCommand[],
): Response | null {
	const denial = authorizeCommands(context.get('authContext').role, commands);
	return denial === null ? null : context.json(denial, 403);
}

/**
 * The row-level half, raised as this module's `CommandError`.
 *
 * Runs from `writeCommands` for every command rather than from the handlers, so
 * "who may touch this row" is answered by the command's entry in the permission
 * map and not by whether its `case` arm remembered to ask.
 */
async function assertCommandOwnership(
	trx: MissionDispatchTransaction,
	command: MissionDispatchCommand,
	actor: CommandActor,
): Promise<void> {
	const outcome = await resolveCommandOwnership(trx, command, actor);
	if (outcome.kind === 'missing') {
		throw new CommandError(404, { error: `${outcome.entity}_not_found` });
	}
	if (outcome.kind === 'refused') {
		throw new CommandError(403, { error: 'forbidden', reason: outcome.reason });
	}
}

export function geojsonToGeom(geojson: unknown) {
	const serialized = JSON.stringify(geojson);
	return sql<string>`st_force2d(st_setsrid(st_geomfromgeojson(
		case
			when (${serialized}::jsonb -> 'geometry') is not null
				then (${serialized}::jsonb -> 'geometry')::text
			else ${serialized}
		end
	), 4326))`;
}

export function localDateColumn(value: string) {
	return sql<Date>`${value}::date`;
}

async function readCurrentTransactionId(trx: MissionDispatchTransaction): Promise<number> {
	const result = await sql<{
		txid: string;
	}>`select pg_current_xact_id()::xid::text as txid`.execute(trx);
	const txid = result.rows[0]?.txid;
	if (txid === undefined) {
		throw new Error('Unable to read current transaction id.');
	}
	return Number.parseInt(txid, 10);
}

export function readDate(value: unknown): Date | null {
	if (typeof value !== 'string' && !(value instanceof Date)) {
		return null;
	}
	const date = value instanceof Date ? value : new Date(value);
	return Number.isNaN(date.getTime()) ? null : date;
}

export function readStringArray(value: unknown): readonly string[] {
	return Array.isArray(value)
		? value.filter((entry): entry is string => typeof entry === 'string')
		: [];
}
