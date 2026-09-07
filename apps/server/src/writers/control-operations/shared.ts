import {
	assertWriteReferences,
	checkedValues,
	type geojsonToGeom,
	localDateColumn,
	softDelete,
	updateRow,
} from '@simmer-mosquito/db';
import type { ControlActionContext, LocationSource } from '@simmer-mosquito/domain';
import type { CommandTransaction } from '../../command-write.js';
import { resolveLocationGeom } from '../../location-source.js';
import { type CommandRow, returnColumns } from '../../return-columns.js';

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
		.returning(returnColumns.application_batches)
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

export type FormulationRow = CommandRow<'formulations'>;

export type FormulationInsecticideRow = CommandRow<'formulation_insecticides'>;

export type ApplicationRow = CommandRow<'applications'>;

export type ApplicationBatchRow = CommandRow<'application_batches'>;

export type SourceReductionRow = CommandRow<'source_reductions'>;

export type OutreachActionRow = CommandRow<'outreach_actions'>;

export type BiocontrolActionRow = CommandRow<'biocontrol_actions'>;

export type RequestedControlActionRow = CommandRow<'requested_control_actions'>;

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
