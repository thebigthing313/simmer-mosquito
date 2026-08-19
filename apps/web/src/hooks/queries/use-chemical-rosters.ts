/**
 * The catalogs a chemical application form picks from.
 *
 * Separate from `use-catalog-rosters.ts` because these are not the same question.
 * That file answers "what may this method field be set to" for seven tables that
 * are all the same shape — an id, a name, a lifecycle flag and a custom schema.
 * These five are each their own shape: a product carries the unit it is measured
 * in, a formulation carries a batch size, a component carries how much of what.
 * Flattening them into one listing would mean a picker reading fields its catalog
 * does not have.
 *
 * All five are eager (`docs/sync.md`), so none of this costs a request and the
 * reads suspend — the rows are there before a form can be reached.
 *
 * Field names stay camelCase, as everywhere in `hooks/queries`: the columns are
 * snake_case and this is the seam that turns them over.
 */

import { useLiveSuspenseQuery } from '@tanstack/react-db';
import { equipment as equipmentCollection } from '../../lib/collections/equipment';
import { formulation_insecticides } from '../../lib/collections/formulation_insecticides';
import { formulations } from '../../lib/collections/formulations';
import { insecticides } from '../../lib/collections/insecticides';
import { vehicles } from '../../lib/collections/vehicles';

/** A product, as a picker and the unit narrowing read one. */
export interface InsecticideListing {
	readonly id: string;
	readonly tradeName: string;
	readonly isActive: boolean;
	/**
	 * What the product is measured in. The form narrows the unit list to that
	 * unit's *type* — a pound of granules is never four fluid ounces.
	 */
	readonly defaultUnitId: string;
}

export function useInsecticideRoster(): readonly InsecticideListing[] {
	return useLiveSuspenseQuery((query) =>
		query.from({ row: insecticides }).select(({ row }) => ({
			id: row.id,
			tradeName: row.trade_name,
			isActive: row.is_active,
			defaultUnitId: row.default_unit_id,
		})),
	).data;
}

/** A vehicle or a piece of equipment — the two rigs a treatment names. */
export interface RigListing {
	readonly id: string;
	readonly name: string;
	readonly isActive: boolean;
}

export function useVehicleRoster(): readonly RigListing[] {
	return useLiveSuspenseQuery((query) =>
		query.from({ row: vehicles }).select(({ row }) => ({
			id: row.id,
			name: row.vehicle_name,
			isActive: row.is_active,
		})),
	).data;
}

export function useEquipmentRoster(): readonly RigListing[] {
	return useLiveSuspenseQuery((query) =>
		query.from({ row: equipmentCollection }).select(({ row }) => ({
			id: row.id,
			name: row.equipment_name,
			isActive: row.is_active,
		})),
	).data;
}

/** A mix, as the calculator reads one: a name, and what one batch of it is. */
export interface FormulationListing {
	readonly id: string;
	readonly formulationName: string;
	readonly isActive: boolean;
	readonly batchSize: number;
	readonly batchUnitId: string;
}

export function useFormulationRoster(): readonly FormulationListing[] {
	return useLiveSuspenseQuery((query) =>
		query.from({ row: formulations }).select(({ row }) => ({
			id: row.id,
			formulationName: row.formulation_name,
			isActive: row.is_active,
			batchSize: row.batch_size,
			batchUnitId: row.batch_unit_id,
		})),
	).data;
}

/** One product's share of a mix. */
export interface FormulationComponentListing {
	readonly id: string;
	readonly formulationId: string;
	readonly insecticideId: string;
	readonly amount: number;
	readonly unitId: string;
}

export function useFormulationComponentRoster(): readonly FormulationComponentListing[] {
	return useLiveSuspenseQuery((query) =>
		query.from({ row: formulation_insecticides }).select(({ row }) => ({
			id: row.id,
			formulationId: row.formulation_id,
			insecticideId: row.insecticide_id,
			amount: row.amount,
			unitId: row.unit_id,
		})),
	).data;
}
