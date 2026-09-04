/**
 * What was identified in one Adult Collection.
 *
 * The adult counterpart of `use-sample-identifications.ts`, and deliberately not
 * the same shape. A larval identification is a species and a count, so that hook
 * joins the taxonomy and orders by the count — it is a summary. This one backs
 * an editable table and a key-entry tally, where each row is a distinct
 * species/sex/status combination the technician can correct or remove, so the
 * rows come up as they are and the name is looked up against the catalog the
 * species picker is already holding.
 *
 * Ordered by `created_at` so the table reads in the order the specimens were
 * keyed, which is the order the piles were sorted into.
 *
 * `collection_species` is on-demand, so this uses the status-gated
 * `useLiveQuery` rather than the suspense variant, which sticks after a
 * navigation unmount over an on-demand collection.
 */

import type { CollectionSpecies } from '@simmer-mosquito/sync';
import { eq, useLiveQuery } from '@tanstack/react-db';
import { collection_species } from '../../lib/collections/collection_species';
import { mapCardGcTimeMs } from './shared';

/** One identification under a collection. */
export interface CollectionIdentification {
	readonly id: string;
	readonly speciesId: string;
	readonly count: number;
	readonly sex: CollectionSpecies['sex'];
	readonly status: CollectionSpecies['status'];
	readonly identifiedByProfileId: string | null;
	/** What the key-entry baseline ranks by, so the earliest row of a pair wins. */
	readonly createdAt: Date;
}

export function useCollectionIdentifications(collectionId: string): {
	readonly identifications: readonly CollectionIdentification[];
	readonly isReady: boolean;
	readonly isError: boolean;
} {
	const result = useLiveQuery(
		{
			gcTime: mapCardGcTimeMs,
			query: (query) =>
				query
					.from({ identification: collection_species() })
					.where(({ identification }) => eq(identification.collection_id, collectionId))
					.orderBy(({ identification }) => identification.created_at, 'asc')
					.select(({ identification }) => ({
						id: identification.id,
						speciesId: identification.species_id,
						count: identification.count,
						sex: identification.sex,
						status: identification.status,
						identifiedByProfileId: identification.identified_by_profile_id,
						createdAt: identification.created_at,
					})),
		},
		[collectionId],
	);

	return {
		identifications: result.data,
		isReady: result.isReady,
		isError: result.isError,
	};
}
