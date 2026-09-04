import { useLiveSuspenseQuery } from '@tanstack/react-db';
import { useMemo } from 'react';
import { habitat_types } from '../../lib/collections/habitat_types';
import type { FilterOption } from './multi-select-filter';

/**
 * The agency's Habitat Types, as filter options and as an id→name lookup.
 *
 * What kind of place a Habitat is — a catch basin, a swale, a tyre pile — is how
 * larval work is grouped, so "only the tyre piles" is a question both the habitat
 * and the inspection explorers get asked, and both label their rows with it.
 *
 * Retired types stay in the list. An explorer looks backwards, and filtering a
 * season's inspections by a type the agency has since stopped using is exactly
 * what an operator asking that question means. The pickers on the *forms* are the
 * surfaces that should offer only what is current.
 *
 * The catalog is eager and small, so this suspends rather than drawing a pending
 * state: it is loaded before an explorer can be reached.
 */
export function useHabitatTypeOptions(): {
	readonly options: readonly FilterOption[];
	readonly nameById: ReadonlyMap<string, string>;
} {
	const result = useLiveSuspenseQuery(
		(query) =>
			query
				.from({ type: habitat_types() })
				.orderBy(({ type }) => type.name, 'asc')
				.select(({ type }) => ({ id: type.id, label: type.name })),
		[],
	);

	const options = result.data;

	return useMemo(
		() => ({
			options,
			nameById: new Map(options.map((type) => [type.id, type.label] as const)),
		}),
		[options],
	);
}
