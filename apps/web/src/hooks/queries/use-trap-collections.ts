/**
 * Everything one Trap has collected, with what each collection caught.
 *
 * The trap directory's right half. `collections` is on-demand, so this query's
 * predicate is what loads the trap's subset — and the species rows come with it
 * as a correlated include rather than as a second query per collection.
 *
 * ## The window
 *
 * `docs/sync.md` sets the policy — "Adult collections: three-year persisted
 * history, older on request" — and this is the surface most able to break it,
 * because a trap kept in the same place for a decade has a decade of collections
 * and every one of them carries its species rows. `seasons` is how many are asked
 * for; `null` lifts the bound.
 *
 * The bound is applied to each date column in its own type, because the two
 * collection timing modes store the date in different columns and a comparison
 * only means something against the one it belongs to. A trap still out has
 * neither, and a comparison against null is never true — so the third clause is
 * what keeps the "Trap out" bucket in the window. Without it the collection an
 * operator is most likely looking for is the one that disappears.
 */

import { and, eq, gte, isNull, or, toArray, useLiveQuery } from '@tanstack/react-db';
import { collection_species } from '../../lib/collections/collection_species';
import { collections } from '../../lib/collections/collections';
import { localDayStartAsInstant, todayInTimeZone } from '../../lib/local-date';
import type { CollectionTimingMode } from './collection-view';
import { activityGcTimeMs } from './shared';

/** One species line under a collection. */
export interface TrapCollectionSpecies {
	readonly id: string;
	readonly speciesId: string;
	readonly count: number;
	readonly sex: 'male' | 'female' | null;
	readonly status: 'damaged' | 'unfed' | 'bloodfed' | 'gravid' | null;
}

/** One collection in a trap's history, with what it caught. */
export interface TrapCollection {
	readonly id: string;
	readonly collectedAt: Date | null;
	readonly collectionDate: string | null;
	readonly collectionTimingMode: CollectionTimingMode;
	readonly hasProblem: boolean;
	readonly isZeroResult: boolean;
	readonly hasBycatch: boolean;
	readonly species: readonly TrapCollectionSpecies[];
}

export function useTrapCollections(
	trapId: string,
	options: {
		/** How many seasons back to load, counting this one. `null` loads every one. */
		readonly seasons: number | null;
		readonly timeZone: string;
	},
): {
	readonly collections: readonly TrapCollection[];
	readonly isReady: boolean;
	readonly isError: boolean;
} {
	const { seasons, timeZone } = options;
	// A calendar year boundary in the agency's zone, as both the string a `date`
	// column compares against and the instant a `timestamptz` one does.
	const sinceDate =
		seasons === null
			? null
			: `${Number(todayInTimeZone(timeZone).slice(0, 4)) - (seasons - 1)}-01-01`;
	const sinceInstant = sinceDate === null ? null : localDayStartAsInstant(sinceDate, timeZone);

	const result = useLiveQuery(
		{
			gcTime: activityGcTimeMs,
			query: (query) =>
				query
					.from({ collection: collections() })
					.where(({ collection }) =>
						sinceDate === null || sinceInstant === null
							? eq(collection.trap_id, trapId)
							: and(
									eq(collection.trap_id, trapId),
									or(
										gte(collection.collected_at, sinceInstant),
										gte(collection.collection_date, sinceDate),
										and(isNull(collection.collected_at), isNull(collection.collection_date)),
									),
								),
					)
					.select(({ collection }) => ({
						id: collection.id,
						collectedAt: collection.collected_at,
						collectionDate: collection.collection_date,
						collectionTimingMode: collection.collection_timing_mode,
						hasProblem: collection.has_problem,
						isZeroResult: collection.is_zero_result,
						hasBycatch: collection.has_bycatch,
						species: toArray(
							query
								.from({ identification: collection_species() })
								.where(({ identification }) => eq(identification.collection_id, collection.id))
								.select(({ identification }) => ({
									id: identification.id,
									speciesId: identification.species_id,
									count: identification.count,
									sex: identification.sex,
									status: identification.status,
								})),
						),
					})),
		},
		[trapId, sinceDate, sinceInstant?.getTime()],
	);

	return { collections: result.data, isReady: result.isReady, isError: result.isError };
}
