import { useLiveSuspenseQuery } from '@tanstack/react-db';
import { formulation_insecticides } from '../../lib/collections/formulation_insecticides';
import type { FormulationComponentListing } from './chemical-roster-view';

/** Every formulation component, for a form that reads a recipe's makeup. */
export function useFormulationComponentRoster(): readonly FormulationComponentListing[] {
	return useLiveSuspenseQuery((query) =>
		query.from({ row: formulation_insecticides() }).select(({ row }) => ({
			id: row.id,
			formulationId: row.formulation_id,
			insecticideId: row.insecticide_id,
			amount: row.amount,
			unitId: row.unit_id,
		})),
	).data;
}
