import { useLiveSuspenseQuery } from '@tanstack/react-db';
import { formulation_insecticides } from '../../lib/collections/formulation_insecticides';
import { type FormulationComponentRecord, groupedByFormulation } from './use-formulation-records';
/** Every formulation component grouped by formulation, for the recipe rows the catalog page expands. */
export function useFormulationComponents(): ReadonlyMap<
	string,
	readonly FormulationComponentRecord[]
> {
	const rows = useLiveSuspenseQuery((query) =>
		query.from({ row: formulation_insecticides() }).select(({ row }) => ({
			id: row.id,
			formulationId: row.formulation_id,
			insecticideId: row.insecticide_id,
			amount: row.amount,
			unitId: row.unit_id,
		})),
	).data;

	// A query returns rows and cannot return a lookup of them.
	return groupedByFormulation(rows);
}
