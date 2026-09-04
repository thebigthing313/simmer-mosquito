/**
 * Formulations and their components, as the recipe catalog needs them.
 *
 * Both tables sync eagerly — a formulation is picked on every mixed application —
 * so this is two whole-table reads rather than a per-recipe subset like the
 * insecticide batches beside it.
 *
 * They are not joined. The page renders the components under the recipe row that
 * was expanded, so what it needs is every component grouped by formulation, and a
 * join would hand back one row per component with the recipe repeated on each.
 * The grouping is a `Map`, which is the one thing a query cannot return.
 */

import { useLiveSuspenseQuery } from '@tanstack/react-db';
import { useMemo } from 'react';
import { formulation_insecticides } from '../../lib/collections/formulation_insecticides';
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

/** Every recipe, active ones first and then by name. */
export function useFormulationRecords(): readonly FormulationRecord[] {
	return useLiveSuspenseQuery(
		(query) =>
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
		[],
	).data;
}

/** Every component, grouped by the recipe it belongs to. */
export function useFormulationComponents(): ReadonlyMap<
	string,
	readonly FormulationComponentRecord[]
> {
	const rows = useLiveSuspenseQuery(
		(query) =>
			query.from({ row: formulation_insecticides() }).select(({ row }) => ({
				id: row.id,
				formulationId: row.formulation_id,
				insecticideId: row.insecticide_id,
				amount: row.amount,
				unitId: row.unit_id,
			})),
		[],
	).data;

	// The `useMemo` this folder allows: a query returns rows and cannot return a
	// lookup of them.
	return useMemo(() => {
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
	}, [rows]);
}
