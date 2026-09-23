/**
 * Collections that have been retrieved but not yet keyed out.
 *
 * Dated — so no longer pending — not declared a zero result, and carrying no
 * species rows. The species are gathered as a correlated include and the empty
 * set is picked out afterwards, because "has no related rows" is not something
 * the predicate can ask: the join key only exists on rows that are there.
 *
 * Only the count of species rows matters, so the include projects nothing but
 * their ids.
 */

import { coalesce, eq, gte, or, toArray, useLiveQuery } from '@tanstack/react-db';
import { addresses } from '../../lib/collections/addresses';
import { collection_methods } from '../../lib/collections/collection_methods';
import { collection_species } from '../../lib/collections/collection_species';
import { collections } from '../../lib/collections/collections';
import { traps } from '../../lib/collections/traps';
import { localDayStartAsInstant } from '../../lib/local-date';
import type { LinkedAddress } from './address-view';
import { compareByCollectionDateDesc } from './collection-view';
import { activityGcTimeMs, addressSelect } from './shared';

/** One collection waiting on identification, as the overview lists it. */
export interface AwaitingCollection {
	readonly id: string;
	readonly trapId: string | null;
	readonly trapName: string | null;
	readonly trapCode: string | null;
	/**
	 * Joined, not looked up. It is the rung below the Trap name on a collection
	 * recorded away from one (#1231); `address-view.ts` says why it is nested.
	 */
	readonly address: LinkedAddress;
	readonly latitude: number;
	readonly longitude: number;
	readonly methodId: string;
	readonly methodName: string;
	readonly collectedAt: Date | null;
	readonly collectionDate: string | null;
}

export function useCollectionsAwaitingIdentification(
	sinceDate: string,
	timeZone: string,
): {
	readonly awaiting: readonly AwaitingCollection[];
	readonly isReady: boolean;
	readonly isError: boolean;
} {
	const sinceInstant = localDayStartAsInstant(sinceDate, timeZone);

	const result = useLiveQuery({
		gcTime: activityGcTimeMs,
		query: (query) =>
			query
				.from({ collection: collections() })
				.where(({ collection }) =>
					or(
						gte(collection.collected_at, sinceInstant),
						gte(collection.collection_date, sinceDate),
					),
				)
				.join({ trap: traps() }, ({ collection, trap }) => eq(collection.trap_id, trap.id), 'left')
				.join(
					{ address: addresses() },
					({ collection, address }) => eq(collection.address_id, address.id),
					'left',
				)
				.join(
					{ method: collection_methods() },
					({ collection, method }) => eq(collection.collection_method_id, method.id),
					'left',
				)
				.select(({ collection, trap, address, method }) => ({
					id: collection.id,
					address: addressSelect(address),
					latitude: collection.lat,
					longitude: collection.lng,
					trapId: collection.trap_id,
					trapName: coalesce(trap.trap_name, null),
					trapCode: coalesce(trap.trap_code, null),
					methodId: collection.collection_method_id,
					methodName: coalesce(method.name, 'Unknown method'),
					collectedAt: collection.collected_at,
					collectionDate: collection.collection_date,
					isZeroResult: collection.is_zero_result,
					species: toArray(
						query
							.from({ identification: collection_species() })
							.where(({ identification }) => eq(identification.collection_id, collection.id))
							.select(({ identification }) => ({ id: identification.id })),
					),
				})),
	});

	const rows = result.data;

	const awaiting = rows
		.filter((row) => !row.isZeroResult && row.species.length === 0)
		.map(
			({
				id,
				address,
				latitude,
				longitude,
				trapId,
				trapName,
				trapCode,
				methodId,
				methodName,
				collectedAt,
				collectionDate,
			}) => ({
				id,
				address,
				latitude,
				longitude,
				trapId,
				trapName,
				trapCode,
				methodId,
				methodName,
				collectedAt,
				collectionDate,
			}),
		)
		.sort(compareByCollectionDateDesc);

	return { awaiting, isReady: result.isReady, isError: result.isError };
}
