import { useLiveSuspenseQuery } from '@tanstack/react-db';
import { useMemo } from 'react';
import { profiles } from '../../lib/collections/profiles';
import type { FilterOption } from './multi-select-filter';

/**
 * The agency's people, as filter options and as an id→name lookup.
 *
 * Every field record is attributed to someone — an inspector, an applicator, a
 * technician — and "what did this crew member do" is a question every explorer
 * gets asked. Profiles are eagerly synced, so this needs no fetch.
 *
 * The sort is in the query rather than the memo: `orderBy` is part of the compiled
 * pipeline, so the rows arrive ordered and the memo only has to shape them. What
 * is left in the memo is the id→name lookup, which a query cannot return.
 *
 * That does drop `localeCompare` for the pipeline's ordering, which differs on
 * accented names — Ángela sorts before Alan rather than between Alan and Beth. It
 * is the same ordering the other picker lists already use, and it is the price of
 * a sort that happens once when a row arrives instead of on every render.
 */
export function usePersonnelOptions(): {
	readonly options: readonly FilterOption[];
	readonly nameById: ReadonlyMap<string, string>;
} {
	const result = useLiveSuspenseQuery(
		(query) =>
			query
				.from({ profile: profiles })
				.orderBy(({ profile }) => profile.display_name, 'asc')
				.select(({ profile }) => ({ id: profile.id, label: profile.display_name })),
		[],
	);

	const people = result.data;

	return useMemo(
		() => ({
			options: people,
			nameById: new Map(people.map((profile) => [profile.id, profile.label] as const)),
		}),
		[people],
	);
}
