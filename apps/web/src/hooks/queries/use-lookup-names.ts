/**
 * One id → name map over every catalog a record can point at.
 *
 * For the surfaces that hold a reference id without knowing which table it came
 * from — the nearby-context panel on a service request, whose items arrive from a
 * server endpoint that returns seven kinds of record and gives each one a `refId`
 * into whichever catalog names it.
 *
 * Ids are uuids and so globally unique, which is what lets one map serve all of
 * them: a `refId` can only match the catalog it belongs to.
 *
 * Every catalog here is eager, so this costs no request. It is still the last
 * resort — anywhere a surface knows which table a reference points at, joining is
 * both cheaper and narrower.
 */

import type { Collection } from '@tanstack/db';
import { useLiveQuery } from '@tanstack/react-db';
import { useMemo } from 'react';
import { biocontrol_methods } from '../../lib/collections/biocontrol_methods';
import { collection_methods } from '../../lib/collections/collection_methods';
import { habitat_types } from '../../lib/collections/habitat_types';
import { insecticides } from '../../lib/collections/insecticides';
import { source_reduction_methods } from '../../lib/collections/source_reduction_methods';

export function useLookupNames(): ReadonlyMap<string, string> {
	const habitatTypeRows = useNames(habitat_types());
	const collectionMethodRows = useNames(collection_methods());
	const sourceReductionMethodRows = useNames(source_reduction_methods());
	const biocontrolMethodRows = useNames(biocontrol_methods());

	// Its own query rather than a fifth `useNames`, because a product is named by
	// its trade name — `shorthand` is an organization's data-entry abbreviation.
	const productResult = useLiveQuery(
		(query) =>
			query
				.from({ product: insecticides() })
				.select(({ product }) => ({ id: product.id, name: product.trade_name })),
		[],
	);
	const productRows = productResult.data;

	return useMemo(
		() =>
			new Map(
				[
					...habitatTypeRows,
					...collectionMethodRows,
					...sourceReductionMethodRows,
					...biocontrolMethodRows,
					...productRows,
				].map((row) => [row.id, row.name] as const),
			),
		[
			habitatTypeRows,
			collectionMethodRows,
			sourceReductionMethodRows,
			biocontrolMethodRows,
			productRows,
		],
	);
}

/**
 * Called four times from one hook, with four different collections. A fixed list
 * in fixed order, so the rules of hooks hold.
 */
function useNames<TRow extends { readonly id: string; readonly name: string }>(
	collection: Collection<TRow, string | number>,
): readonly { readonly id: string; readonly name: string }[] {
	const result = useLiveQuery(
		(query) =>
			query.from({ row: collection }).select(({ row }) => ({ id: row.id, name: row.name })),
		[collection],
	);

	return result.data;
}
