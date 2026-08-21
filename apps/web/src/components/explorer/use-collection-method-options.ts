import { useLiveSuspenseQuery } from '@tanstack/react-db';
import { useMemo } from 'react';
import { collection_methods } from '../../lib/collections/collection_methods';
import type { FilterOption } from './multi-select-filter';

/**
 * The agency's Collection Methods, as filter options and as an id→name lookup.
 *
 * How a trap catches — a light trap, a gravid trap, a BG — is what makes two
 * counts comparable or not, so "only the gravid traps" is a question both the
 * trap and the collection explorers get asked, and both label their rows with it.
 *
 * Retired methods stay in the list, for the reason they do in
 * {@link useHabitatTypeOptions}: an explorer looks backwards, and a season's
 * collections made with a method the agency has since dropped are exactly what an
 * operator filtering by it is asking for. The pickers on the forms are the
 * surfaces that should offer only what is current.
 *
 * The catalog is eager and small, so this suspends rather than drawing a pending
 * state: it is loaded before an explorer can be reached.
 */
export function useCollectionMethodOptions(): {
	readonly options: readonly FilterOption[];
	readonly nameById: ReadonlyMap<string, string>;
} {
	const result = useLiveSuspenseQuery(
		(query) =>
			query
				.from({ method: collection_methods })
				.orderBy(({ method }) => method.name, 'asc')
				.select(({ method }) => ({ id: method.id, label: method.name })),
		[],
	);

	const options = result.data;

	return useMemo(
		() => ({
			options,
			nameById: new Map(options.map((method) => [method.id, method.label] as const)),
		}),
		[options],
	);
}
