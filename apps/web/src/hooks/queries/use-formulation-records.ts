import { useLiveSuspenseQuery } from '@tanstack/react-db';
import { formulations } from '../../lib/collections/formulations';

/** A recipe as the catalog lists and edits one. */
export interface FormulationRecord {
	readonly id: string;
	readonly formulationName: string;
	readonly description: string | null;
	readonly batchSize: number;
	readonly batchUnitId: string;
	readonly isActive: boolean;
}

/** One product in a recipe, and how much of it a batch takes. */
export interface FormulationComponentRecord {
	readonly id: string;
	readonly formulationId: string;
	readonly insecticideId: string;
	readonly amount: number;
	readonly unitId: string;
}

/** Formulations as the recipe catalog lists them, in name order. */
export function useFormulationRecords(): readonly FormulationRecord[] {
	return useLiveSuspenseQuery((query) =>
		query
			.from({ row: formulations() })
			.orderBy(({ row }) => row.is_active, 'desc')
			.orderBy(({ row }) => row.formulation_name, 'asc')
			.select(({ row }) => ({
				id: row.id,
				formulationName: row.formulation_name,
				description: row.description,
				batchSize: row.batch_size,
				batchUnitId: row.batch_unit_id,
				isActive: row.is_active,
			})),
	).data;
}

/** The components grouped by recipe, in the order the query returned them. */
export function groupedByFormulation(
	rows: readonly FormulationComponentRecord[],
): ReadonlyMap<string, readonly FormulationComponentRecord[]> {
	const byFormulation = new Map<string, FormulationComponentRecord[]>();
	for (const row of rows) {
		const existing = byFormulation.get(row.formulationId);
		if (existing === undefined) {
			byFormulation.set(row.formulationId, [row]);
		} else {
			existing.push(row);
		}
	}
	return byFormulation;
}
