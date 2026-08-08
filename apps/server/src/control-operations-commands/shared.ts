import { type geojsonToGeom, localDateColumn, softDelete, updateRow } from '@simmer-mosquito/db';
import type {
	ControlActionContext,
	ControlActionLocationSourceInput,
	ControlOperationsCommand,
	LocationSource,
} from '@simmer-mosquito/domain';
import type { MiddlewareHandler } from 'hono';
import type { AuthVariables } from '../auth-middleware.js';
import {
	type AgencyContext,
	agencyCommandContext,
	type CommandContext,
	commandEndpoint,
	createCommand,
	handleCommandError,
	invalidUpdate,
	type CommandsResult as SharedCommandsResult,
} from '../command-endpoint.js';
import { isRecord, readNullableText } from '../command-payload.js';
import {
	type CommandDb,
	type CommandTransaction,
	commandActor,
	readDate,
	writeCommands,
} from '../command-write.js';
import { resolveLocationGeom } from '../location-source.js';

export type ControlOperationsDb = CommandDb;
export type ControlOperationsTransaction = CommandTransaction;
export {
	type AgencyContext,
	agencyCommandContext,
	type CommandContext,
	commandActor,
	commandEndpoint,
	createCommand,
	handleCommandError,
	invalidUpdate,
	localDateColumn,
	readDate,
	softDelete,
	writeCommands,
};

/** The action tables carry the same shape, so one updater serves them all. */
export const updateActionRow = updateRow;

/** This family's name for the shared resolver. */
export const resolveGeom = resolveLocationGeom;

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
 * Control operations were the one family whose ownership rule turns on a record
 * the collector *performed* rather than one assigned to them. That is still true
 * of the rule; it is no longer true of the plumbing, which is `writeCommands`
 * for every family now.
 */
export const writeActionCommands = writeCommands;

// ===========================================================================
// Location source / context resolution
// ===========================================================================

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
		// The whole union, not a workflow's slice: this builds columns for both
		// performed actions and requested ones, and those two workflows permit
		// different sources. Which sources each allows is settled in the domain
		// builders before a command gets here.
		readonly locationSource?: LocationSource;
		readonly addressId?: string | null;
		readonly context?: ControlActionContext;
		readonly requestedControlActionId?: string | null;
	},
	available: { readonly collection?: boolean; readonly habitat?: boolean },
): Promise<Record<string, unknown>> {
	const columns: Record<string, unknown> = {};
	if (changes.locationSource !== undefined) {
		columns.geom = await resolveLocationGeom(trx, organizationId, changes.locationSource);
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

export type CommandsResult = SharedCommandsResult<ControlOperationsCommand>;

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
