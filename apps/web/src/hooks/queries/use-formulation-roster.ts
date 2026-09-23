import { useLiveSuspenseQuery } from '@tanstack/react-db';
import { formulations } from '../../lib/collections/formulations';
import type { FormulationListing } from './chemical-roster-view';

/** The organization's formulations as an application form picks from them. */
export function useFormulationRoster(): readonly FormulationListing[] {
	return useLiveSuspenseQuery((query) =>
		query.from({ row: formulations() }).select(({ row }) => ({
			id: row.id,
			formulationName: row.formulation_name,
			isActive: row.is_active,
			batchSize: row.batch_size,
			batchUnitId: row.batch_unit_id,
		})),
	).data;
}
