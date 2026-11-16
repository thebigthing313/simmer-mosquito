import { localDateColumn, softDelete, updateRow } from '@simmer-mosquito/db';
import type { ControlActionContext, LocationSource } from '@simmer-mosquito/domain';
import type { CommandTransaction } from '../../command-write.js';
import { resolveLocationGeom } from '../../location-source.js';
import type { CommandRow } from '../../return-columns.js';

export type ControlOperationsTransaction = CommandTransaction;
export { localDateColumn, softDelete };

/** The action tables carry the same shape, so one updater serves them all. */
export const updateActionRow = updateRow;

/** This family's name for the shared resolver. */
export const resolveGeom = resolveLocationGeom;

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

export type TreatmentRow = CommandRow<'treatments'>;

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
