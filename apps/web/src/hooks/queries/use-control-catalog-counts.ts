/**
 * How many rows are active in each control-operations catalog.
 *
 * The overview's catalog tiles, which show a count and link onward. They read
 * every row of five eager tables to do it — the methods, the products, the
 * formulations — and then counted the active ones in JavaScript.
 *
 * Five `count()` aggregates instead. The aggregate is computed in the query
 * pipeline, so a catalog that gains a row emits one changed number rather than
 * a new array of every row in the table; and the filter is a predicate, so an
 * organization's retired methods are never materialized at all.
 */

import type { Collection } from '@tanstack/db';
import { count, eq, useLiveQuery } from '@tanstack/react-db';
import { application_methods } from '../../lib/collections/application_methods';
import { biocontrol_methods } from '../../lib/collections/biocontrol_methods';
import { formulations } from '../../lib/collections/formulations';
import { insecticides } from '../../lib/collections/insecticides';
import { source_reduction_methods } from '../../lib/collections/source_reduction_methods';

export interface ControlCatalogCounts {
	readonly applicationMethods: number;
	readonly insecticides: number;
	readonly formulations: number;
	readonly sourceReductionMethods: number;
	readonly biocontrolMethods: number;
}

export function useControlCatalogCounts(): ControlCatalogCounts {
	return {
		applicationMethods: useActiveCount(application_methods()),
		insecticides: useActiveCount(insecticides()),
		formulations: useActiveCount(formulations()),
		sourceReductionMethods: useActiveCount(source_reduction_methods()),
		biocontrolMethods: useActiveCount(biocontrol_methods()),
	};
}

/**
 * Called five times from one hook, with five different collections. That is a
 * fixed list in fixed order, so the rules of hooks hold: the same five queries
 * run in the same sequence on every render.
 */
function useActiveCount<TRow extends { readonly id: string; readonly is_active: boolean }>(
	collection: Collection<TRow, string | number>,
): number {
	const result = useLiveQuery(
		(query) =>
			query
				.from({ row: collection })
				.where(({ row }) => eq(row.is_active, true))
				.select(({ row }) => ({ total: count(row.id) })),
		[collection],
	);

	// An aggregate with no `groupBy` is one row; it is absent only before the
	// first result, which for an eager catalog is the frame before it renders.
	return (result.data[0]?.total as number | undefined) ?? 0;
}
