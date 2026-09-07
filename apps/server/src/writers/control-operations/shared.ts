import {
	assertWriteReferences,
	checkedValues,
	type geojsonToGeom,
	localDateColumn,
	type SelectedRow,
	softDelete,
	updateRow,
} from '@simmer-mosquito/db';
import type { ControlActionContext, LocationSource } from '@simmer-mosquito/domain';
import type { CommandTransaction } from '../../command-write.js';
import { resolveLocationGeom } from '../../location-source.js';

export type ControlOperationsTransaction = CommandTransaction;
export { localDateColumn, softDelete };

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
): Promise<ApplicationBatchRow> {
	await assertWriteReferences(trx, {
		organizationId: input.organizationId,
		write: { kind: 'create' },
		references: [
			{
				column: 'insecticide_batch_id',
				catalog: 'insecticideBatch',
				id: input.insecticideBatchId,
				label: 'batch',
			},
		],
	});

	const row = await trx
		.insertInto('application_batches')
		.values(
			await checkedValues(trx, input.organizationId, {
				id: input.id,
				organization_id: input.organizationId,
				application_id: input.applicationId,
				insecticide_batch_id: input.insecticideBatchId,
				created_by_profile_id: input.actorProfileId,
				updated_by_profile_id: input.actorProfileId,
			}),
		)
		.returning(applicationBatchReturnColumns)
		.executeTakeFirstOrThrow();
	return row;
}

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

export type FormulationRow = SelectedRow<'formulations', typeof formulationReturnColumns>;

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

export type FormulationInsecticideRow = SelectedRow<
	'formulation_insecticides',
	typeof formulationInsecticideReturnColumns
>;

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

export type ApplicationRow = SelectedRow<'applications', typeof applicationReturnColumns>;

export const applicationBatchReturnColumns = [
	'id',
	'organization_id',
	'application_id',
	'insecticide_batch_id',
	'created_at',
	'updated_at',
] as const;

export type ApplicationBatchRow = SelectedRow<
	'application_batches',
	typeof applicationBatchReturnColumns
>;

export const sourceReductionReturnColumns = [
	'id',
	'organization_id',
	'metadata',
	'created_at',
	'updated_at',
] as const;

export type SourceReductionRow = SelectedRow<
	'source_reductions',
	typeof sourceReductionReturnColumns
>;

export const outreachActionReturnColumns = [
	'id',
	'organization_id',
	'metadata',
	'created_at',
	'updated_at',
] as const;

export type OutreachActionRow = SelectedRow<'outreach_actions', typeof outreachActionReturnColumns>;

export const biocontrolActionReturnColumns = [
	'id',
	'organization_id',
	'metadata',
	'created_at',
	'updated_at',
] as const;

export type BiocontrolActionRow = SelectedRow<
	'biocontrol_actions',
	typeof biocontrolActionReturnColumns
>;

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

export type RequestedControlActionRow = SelectedRow<
	'requested_control_actions',
	typeof requestedControlActionReturnColumns
>;

// ===========================================================================
// Shared command + request helpers
// ===========================================================================

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
