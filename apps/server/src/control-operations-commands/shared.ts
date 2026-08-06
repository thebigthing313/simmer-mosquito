import {
	type Kysely,
	type MutationWriteResult,
	RecordDeleteBlockedError,
	type SimmerDatabase,
	sql,
	type Transaction,
} from '@simmer-mosquito/db';
import {
	type ControlActionContext,
	type ControlActionLocationSourceInput,
	type ControlOperationsCommand,
	DomainValidationError,
} from '@simmer-mosquito/domain';
import type { Context, MiddlewareHandler } from 'hono';
import type { AuthContext } from '../auth-context.js';
import type { AuthVariables } from '../auth-middleware.js';
import { resolveCommandOwnership } from '../command-ownership.js';
import { isRecord, readNullableText } from '../command-payload.js';
import type { CommandActor } from '../command-permissions.js';
import { deleteBlockedBody } from '../record-deletion.js';

export type ControlOperationsDb = Kysely<SimmerDatabase>;
export type ControlOperationsTransaction = Transaction<SimmerDatabase>;
export type CommandContext = Context<{ Variables: AuthVariables }>;

export async function insertApplicationBatch(
	trx: ControlOperationsTransaction,
	input: {
		readonly id: string;
		readonly organizationId: string;
		readonly applicationId: string;
		readonly insecticideBatchId: string;
		readonly actorProfileId: string;
	},
): Promise<SafeApplicationBatch> {
	const row = await trx
		.insertInto('application_batches')
		.values({
			id: input.id,
			organization_id: input.organizationId,
			application_id: input.applicationId,
			insecticide_batch_id: input.insecticideBatchId,
			created_by_profile_id: input.actorProfileId,
			updated_by_profile_id: input.actorProfileId,
		})
		.returning(applicationBatchReturnColumns)
		.executeTakeFirstOrThrow();
	return toSafeApplicationBatch(row);
}

/**
 * The row-level half of authorization, raised as this module's `CommandError`.
 *
 * Control operations are the only domain where a collector's reach depends on a
 * record they *performed* rather than one assigned to them, so the check needs
 * the stored row and runs inside the write transaction. It runs from the write
 * loop for every command rather than from the handlers, so a command whose
 * permission entry names an ownership rule is checked whether or not its `case`
 * arm remembered to ask.
 */
export async function assertActionOwnership(
	trx: ControlOperationsTransaction,
	command: ControlOperationsCommand,
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

export function commandActor(authContext: AuthContext): CommandActor {
	return { role: authContext.role, profileId: authContext.profile.id };
}

/**
 * The write transaction the control-operations endpoints commit through.
 *
 * `actor` is required rather than optional so ownership cannot be skipped by
 * omission: a caller with no actor to pass cannot compile.
 */
export async function writeActionCommands<TSafe>(
	db: ControlOperationsDb,
	actor: CommandActor,
	commands: readonly ControlOperationsCommand[],
	write: (
		trx: ControlOperationsTransaction,
		command: ControlOperationsCommand,
	) => Promise<TSafe | null>,
): Promise<MutationWriteResult<TSafe | null>> {
	return db.transaction().execute(async (trx) => {
		let row: TSafe | null = null;
		for (const command of commands) {
			await assertActionOwnership(trx, command, actor);
			row = await write(trx, command);
		}
		return { row, txid: await readCurrentTransactionId(trx) };
	});
}

// ===========================================================================
// Location source / context resolution
// ===========================================================================

type GeomTable =
	| 'addresses'
	| 'habitats'
	| 'inspections'
	| 'traps'
	| 'collections'
	| 'service_requests'
	| 'requested_control_actions'
	| 'mission_items';

export async function resolveGeom(
	trx: ControlOperationsTransaction,
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
		case 'missionItem':
			return geojsonToGeom(
				await loadGeojson(trx, 'mission_items', source.missionItemId as string, organizationId),
			);
		default:
			throw new CommandError(400, { error: 'unsupported_location_source' });
	}
}

async function loadGeojson(
	trx: ControlOperationsTransaction,
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

export function contextIds(context: ControlActionContext): {
	readonly habitatId: string | null;
	readonly inspectionId: string | null;
	readonly collectionId: string | null;
} {
	if (context.kind === 'larval') {
		return {
			habitatId: context.habitatId ?? null,
			inspectionId: context.inspectionId ?? null,
			collectionId: null,
		};
	}
	if (context.kind === 'adult') {
		return { habitatId: null, inspectionId: null, collectionId: context.collectionId };
	}
	return { habitatId: null, inspectionId: null, collectionId: null };
}

/**
 * Build the column patch for a location-and-context change. `geom`, `address_id`,
 * and `requested_control_action_id` apply where present; a `context` change
 * rewrites the habitat/inspection/collection ids (only the columns the table has,
 * selected by `available`).
 */
export async function locationContextColumns(
	trx: ControlOperationsTransaction,
	organizationId: string,
	changes: {
		readonly locationSource?: { readonly kind: string } & Record<string, unknown>;
		readonly addressId?: string | null;
		readonly context?: ControlActionContext;
		readonly requestedControlActionId?: string | null;
	},
	available: { readonly collection?: boolean; readonly habitat?: boolean },
): Promise<Record<string, unknown>> {
	const columns: Record<string, unknown> = {};
	if (changes.locationSource !== undefined) {
		columns.geom = await resolveGeom(trx, organizationId, changes.locationSource);
	}
	if ('addressId' in changes) {
		columns.address_id = changes.addressId ?? null;
	}
	if ('requestedControlActionId' in changes) {
		columns.requested_control_action_id = changes.requestedControlActionId ?? null;
	}
	if (changes.context !== undefined) {
		const ids = contextIds(changes.context);
		if (available.habitat !== false) {
			columns.habitat_id = ids.habitatId;
		}
		columns.inspection_id = ids.inspectionId;
		if (available.collection === true) {
			columns.collection_id = ids.collectionId;
		}
	}
	return columns;
}

export function readControlActionContext(payload: Record<string, unknown>): ControlActionContext {
	if (isRecord(payload.context)) {
		return payload.context as ControlActionContext;
	}
	const collectionId = readNullableText(payload.collectionId);
	if (collectionId !== null) {
		return { kind: 'adult', collectionId };
	}
	const habitatId = readNullableText(payload.habitatId);
	const inspectionId = readNullableText(payload.inspectionId);
	if (habitatId !== null || inspectionId !== null) {
		return {
			kind: 'larval',
			...(habitatId !== null ? { habitatId } : {}),
			...(inspectionId !== null ? { inspectionId } : {}),
		};
	}
	return { kind: 'none' };
}

export function hasLocationContextChange(payload: Record<string, unknown>): boolean {
	return (
		'locationSource' in payload ||
		'addressId' in payload ||
		'context' in payload ||
		'habitatId' in payload ||
		'inspectionId' in payload ||
		'collectionId' in payload ||
		'requestedControlActionId' in payload
	);
}

export function locationContextInput(payload: Record<string, unknown>): {
	readonly locationSource?: ControlActionLocationSourceInput;
	readonly addressId?: string | null;
	readonly context?: ControlActionContext;
	readonly requestedControlActionId?: string | null;
} {
	return {
		...('locationSource' in payload
			? { locationSource: payload.locationSource as ControlActionLocationSourceInput }
			: {}),
		...('addressId' in payload ? { addressId: readNullableText(payload.addressId) } : {}),
		...('context' in payload ||
		'habitatId' in payload ||
		'inspectionId' in payload ||
		'collectionId' in payload
			? { context: readControlActionContext(payload) }
			: {}),
		...('requestedControlActionId' in payload
			? { requestedControlActionId: readNullableText(payload.requestedControlActionId) }
			: {}),
	};
}

// ===========================================================================
// Generic row write helpers
// ===========================================================================

export async function updateActionRow<TRow, TSafe>(
	trx: ControlOperationsTransaction,
	table:
		| 'applications'
		| 'source_reductions'
		| 'outreach_actions'
		| 'biocontrol_actions'
		| 'requested_control_actions',
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
	trx: ControlOperationsTransaction,
	table:
		| 'formulations'
		| 'formulation_insecticides'
		| 'applications'
		| 'application_batches'
		| 'source_reductions'
		| 'outreach_actions'
		| 'biocontrol_actions'
		| 'requested_control_actions',
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

// ===========================================================================
// Response shaping
// ===========================================================================

export const formulationReturnColumns = [
	'id',
	'organization_id',
	'formulation_name',
	'description',
	'is_active',
	'batch_size',
	'batch_unit_id',
	'created_by_profile_id',
	'updated_by_profile_id',
	'created_at',
	'updated_at',
] as const;

export interface SafeFormulation {
	readonly id: string;
	readonly organizationId: string;
	readonly formulationName: string;
	readonly description: string | null;
	readonly isActive: boolean;
	readonly batchSize: number;
	readonly batchUnitId: string;
	readonly createdByProfileId: string | null;
	readonly updatedByProfileId: string | null;
	readonly createdAt: Date;
	readonly updatedAt: Date;
}

export function toSafeFormulation(row: {
	readonly id: string;
	readonly organization_id: string;
	readonly formulation_name: string;
	readonly description: string | null;
	readonly is_active: boolean;
	readonly batch_size: number;
	readonly batch_unit_id: string;
	readonly created_by_profile_id: string | null;
	readonly updated_by_profile_id: string | null;
	readonly created_at: Date;
	readonly updated_at: Date;
}): SafeFormulation {
	return {
		id: row.id,
		organizationId: row.organization_id,
		formulationName: row.formulation_name,
		description: row.description,
		isActive: row.is_active,
		batchSize: row.batch_size,
		batchUnitId: row.batch_unit_id,
		createdByProfileId: row.created_by_profile_id,
		updatedByProfileId: row.updated_by_profile_id,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

export const formulationInsecticideReturnColumns = [
	'id',
	'organization_id',
	'formulation_id',
	'insecticide_id',
	'amount',
	'unit_id',
	'created_by_profile_id',
	'updated_by_profile_id',
	'created_at',
	'updated_at',
] as const;

export interface SafeFormulationInsecticide {
	readonly id: string;
	readonly organizationId: string;
	readonly formulationId: string;
	readonly insecticideId: string;
	readonly amount: number;
	readonly unitId: string;
	readonly createdByProfileId: string | null;
	readonly updatedByProfileId: string | null;
	readonly createdAt: Date;
	readonly updatedAt: Date;
}

export function toSafeFormulationInsecticide(row: {
	readonly id: string;
	readonly organization_id: string;
	readonly formulation_id: string;
	readonly insecticide_id: string;
	readonly amount: number;
	readonly unit_id: string;
	readonly created_by_profile_id: string | null;
	readonly updated_by_profile_id: string | null;
	readonly created_at: Date;
	readonly updated_at: Date;
}): SafeFormulationInsecticide {
	return {
		id: row.id,
		organizationId: row.organization_id,
		formulationId: row.formulation_id,
		insecticideId: row.insecticide_id,
		amount: row.amount,
		unitId: row.unit_id,
		createdByProfileId: row.created_by_profile_id,
		updatedByProfileId: row.updated_by_profile_id,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

export const applicationReturnColumns = [
	'id',
	'organization_id',
	'application_method_id',
	'insecticide_id',
	'applicator_profile_id',
	'application_date',
	'address_id',
	'vehicle_id',
	'equipment_id',
	'amount_applied',
	'application_unit_id',
	'habitat_id',
	'collection_id',
	'inspection_id',
	'requested_control_action_id',
	'mission_item_id',
	'metadata',
	'created_by_profile_id',
	'updated_by_profile_id',
	'created_at',
	'updated_at',
] as const;

export interface SafeApplication {
	readonly id: string;
	readonly organizationId: string;
	readonly metadata: unknown | null;
	readonly createdAt: Date;
	readonly updatedAt: Date;
}

export function toSafeApplication(row: {
	readonly id: string;
	readonly organization_id: string;
	readonly metadata: unknown | null;
	readonly created_at: Date;
	readonly updated_at: Date;
}): SafeApplication {
	return {
		id: row.id,
		organizationId: row.organization_id,
		metadata: row.metadata,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

export const applicationBatchReturnColumns = [
	'id',
	'organization_id',
	'application_id',
	'insecticide_batch_id',
	'created_at',
	'updated_at',
] as const;

export interface SafeApplicationBatch {
	readonly id: string;
	readonly organizationId: string;
	readonly applicationId: string;
	readonly insecticideBatchId: string;
	readonly createdAt: Date;
	readonly updatedAt: Date;
}

export function toSafeApplicationBatch(row: {
	readonly id: string;
	readonly organization_id: string;
	readonly application_id: string;
	readonly insecticide_batch_id: string;
	readonly created_at: Date;
	readonly updated_at: Date;
}): SafeApplicationBatch {
	return {
		id: row.id,
		organizationId: row.organization_id,
		applicationId: row.application_id,
		insecticideBatchId: row.insecticide_batch_id,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

export const sourceReductionReturnColumns = [
	'id',
	'organization_id',
	'metadata',
	'created_at',
	'updated_at',
] as const;

export interface SafeSourceReduction {
	readonly id: string;
	readonly organizationId: string;
	readonly metadata: unknown | null;
	readonly createdAt: Date;
	readonly updatedAt: Date;
}

export function toSafeSourceReduction(row: {
	readonly id: string;
	readonly organization_id: string;
	readonly metadata: unknown | null;
	readonly created_at: Date;
	readonly updated_at: Date;
}): SafeSourceReduction {
	return {
		id: row.id,
		organizationId: row.organization_id,
		metadata: row.metadata,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

export const outreachActionReturnColumns = [
	'id',
	'organization_id',
	'metadata',
	'created_at',
	'updated_at',
] as const;

export interface SafeOutreachAction {
	readonly id: string;
	readonly organizationId: string;
	readonly metadata: unknown | null;
	readonly createdAt: Date;
	readonly updatedAt: Date;
}

export function toSafeOutreachAction(row: {
	readonly id: string;
	readonly organization_id: string;
	readonly metadata: unknown | null;
	readonly created_at: Date;
	readonly updated_at: Date;
}): SafeOutreachAction {
	return {
		id: row.id,
		organizationId: row.organization_id,
		metadata: row.metadata,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

export const biocontrolActionReturnColumns = [
	'id',
	'organization_id',
	'metadata',
	'created_at',
	'updated_at',
] as const;

export interface SafeBiocontrolAction {
	readonly id: string;
	readonly organizationId: string;
	readonly metadata: unknown | null;
	readonly createdAt: Date;
	readonly updatedAt: Date;
}

export function toSafeBiocontrolAction(row: {
	readonly id: string;
	readonly organization_id: string;
	readonly metadata: unknown | null;
	readonly created_at: Date;
	readonly updated_at: Date;
}): SafeBiocontrolAction {
	return {
		id: row.id,
		organizationId: row.organization_id,
		metadata: row.metadata,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

export const requestedControlActionReturnColumns = [
	'id',
	'organization_id',
	'control_type',
	'recommended_method_id',
	'summary',
	'habitat_id',
	'inspection_id',
	'collection_id',
	'address_id',
	'requested_by_profile_id',
	'requested_at',
	'resolved_at',
	'resolved_by_profile_id',
	'created_at',
	'updated_at',
] as const;

export interface SafeRequestedControlAction {
	readonly id: string;
	readonly organizationId: string;
	readonly controlType: string;
	readonly resolvedAt: Date | null;
	readonly createdAt: Date;
	readonly updatedAt: Date;
}

export function toSafeRequestedControlAction(row: {
	readonly id: string;
	readonly organization_id: string;
	readonly control_type: string;
	readonly resolved_at: Date | null;
	readonly created_at: Date;
	readonly updated_at: Date;
}): SafeRequestedControlAction {
	return {
		id: row.id,
		organizationId: row.organization_id,
		controlType: row.control_type,
		resolvedAt: row.resolved_at,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

// ===========================================================================
// Shared command + request helpers
// ===========================================================================

export interface RouteOptions {
	readonly db: ControlOperationsDb;
	readonly authContextMiddleware: MiddlewareHandler<{ Variables: AuthVariables }>;
}

export type AgencyContext = { readonly organizationId: string; readonly actorProfileId: string };

export type CommandsResult =
	| { readonly ok: true; readonly commands: readonly ControlOperationsCommand[] }
	| { readonly ok: false; readonly body: InvalidCommandBody };

export type FormulationUpdateColumns = {
	formulation_name?: string;
	description?: string | null;
	batch_size?: number;
	batch_unit_id?: string;
	is_active?: boolean;
	updated_by_profile_id: string;
};

export type ApplicationUpdateColumns = {
	geom?: ReturnType<typeof geojsonToGeom>;
	application_method_id?: string | null;
	insecticide_id?: string;
	applicator_profile_id?: string | null;
	application_date?: ReturnType<typeof localDateColumn>;
	address_id?: string | null;
	vehicle_id?: string | null;
	equipment_id?: string | null;
	amount_applied?: number;
	application_unit_id?: string;
	habitat_id?: string | null;
	collection_id?: string | null;
	inspection_id?: string | null;
	requested_control_action_id?: string | null;
	metadata?: unknown | null;
	updated_by_profile_id: string;
};

class CommandError extends Error {
	constructor(
		readonly status: 400 | 403 | 404,
		readonly body: { readonly error: string; readonly reason?: string },
	) {
		super(body.error);
	}
}

export function handleCommandError(context: CommandContext, error: unknown) {
	if (error instanceof CommandError) {
		return context.json(error.body, error.status);
	}
	if (error instanceof RecordDeleteBlockedError) {
		return context.json(deleteBlockedBody(error), 409);
	}
	throw error;
}

export type InvalidCommandBody = {
	readonly error: 'invalid_command';
	readonly message: string;
	readonly issues: readonly { readonly path: string; readonly message: string }[];
};

export function createCommand<TCommand extends ControlOperationsCommand>(
	build: () => TCommand,
):
	| { readonly ok: true; readonly command: TCommand }
	| { readonly ok: false; readonly body: InvalidCommandBody } {
	try {
		return { ok: true, command: build() };
	} catch (error) {
		if (error instanceof DomainValidationError) {
			return {
				ok: false,
				body: { error: 'invalid_command', message: error.message, issues: error.issues },
			};
		}
		throw error;
	}
}

export function invalidUpdate(changeNoun: string): {
	readonly ok: false;
	readonly body: InvalidCommandBody;
} {
	const message = `At least one ${changeNoun} field must change.`;
	return {
		ok: false,
		body: { error: 'invalid_command', message, issues: [{ path: 'changes', message }] },
	};
}

export function agencyCommandContext(authContext: AuthContext): AgencyContext {
	return {
		organizationId: authContext.organization.id,
		actorProfileId: authContext.profile.id,
	};
}

function geojsonToGeom(geojson: unknown) {
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

export async function readCurrentTransactionId(trx: ControlOperationsTransaction): Promise<number> {
	const result = await sql<{
		txid: string;
	}>`select pg_current_xact_id()::xid::text as txid`.execute(trx);
	const txid = result.rows[0]?.txid;
	if (txid === undefined) {
		throw new Error('Unable to read current transaction id.');
	}
	return Number.parseInt(txid, 10);
}

export type JsonResult =
	| { readonly ok: true; readonly payload: Record<string, unknown> }
	| { readonly ok: false; readonly reason: string };

export async function readJsonObject(request: {
	readonly json: () => Promise<unknown>;
}): Promise<JsonResult> {
	let raw: unknown;
	try {
		raw = await request.json();
	} catch {
		return { ok: false, reason: 'Request body must be JSON.' };
	}
	if (!isRecord(raw)) {
		return { ok: false, reason: 'Request body must be an object.' };
	}
	return { ok: true, payload: raw };
}

export function readDate(value: unknown): Date | null {
	if (typeof value !== 'string' && !(value instanceof Date)) {
		return null;
	}
	const date = value instanceof Date ? value : new Date(value);
	return Number.isNaN(date.getTime()) ? null : date;
}
