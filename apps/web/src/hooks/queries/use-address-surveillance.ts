/**
 * The Habitats and Traps sited at a set of Addresses.
 *
 * Search matches a record on text that record holds, and #285 settled that it
 * stays that way: an address the Habitat only points at would have to be
 * re-projected into four document classes on every rename, and street prose in a
 * corpus of codes re-ranks queries that have nothing to do with an address. So
 * the Address is the hop, and this is what lets it be one click rather than a
 * second search.
 *
 * Ids in a batch rather than one address at a time, because the results page
 * draws a list of Addresses and a hook per row would be a subset request per
 * row. `habitats` is on-demand, so the batch is what keeps it to one
 * `address_id = ANY($1)`. `traps` is eager, and there the same predicate filters
 * rows that are already local.
 *
 * Inactive records are returned rather than dropped. A retired trap at an
 * address is still the answer to "what is here", and the caller marks it.
 */

import { coalesce, concat, inArray, useLiveQuery } from '@tanstack/react-db';
import { useMemo } from 'react';
import { habitats } from '../../lib/collections/habitats';
import { traps } from '../../lib/collections/traps';
import { activityGcTimeMs, unmatchableId } from './shared';
import { trapDisplayName } from './trap-view';

/** One Habitat or Trap, as a link to it needs it. */
export interface AddressRecordLink {
	readonly id: string;
	/** Never empty. An unnamed Habitat reads out its centroid. */
	readonly name: string;
	readonly isActive: boolean;
}

export interface AddressSurveillance {
	readonly habitatsByAddress: ReadonlyMap<string, readonly AddressRecordLink[]>;
	readonly trapsByAddress: ReadonlyMap<string, readonly AddressRecordLink[]>;
	readonly isReady: boolean;
	readonly isError: boolean;
}

/**
 * How many Addresses one pair of subsets covers.
 *
 * A ceiling, not a margin, and the same choice `useHabitatNames` makes. The
 * results page grows its list by scrolling, so without this an hour of scrolling
 * through addresses would put every one of them in the predicate. Past the cap an
 * Address simply has no links, which is the state it was in before this existed.
 */
const maxAddressIds = 100;

export function useAddressSurveillance(addressIds: readonly string[]): AddressSurveillance {
	// Sorted as well as deduplicated so the same addresses in a different order
	// are the same query, and a re-render that reshuffles a list does not look
	// like a new subset.
	const ids = [...new Set(addressIds)].sort().slice(0, maxAddressIds);
	const idsKey = ids.join(',');
	const queryIds = ids.length > 0 ? ids : [unmatchableId];

	const habitatResult = useLiveQuery(
		{
			gcTime: activityGcTimeMs,
			query: (query) =>
				query
					.from({ habitat: habitats })
					.where(({ habitat }) => inArray(habitat.address_id, queryIds))
					.select(({ habitat }) => ({
						id: habitat.id,
						addressId: habitat.address_id,
						name: coalesce(habitat.habitat_name, concat(habitat.lat, ', ', habitat.lng)),
						isActive: habitat.is_active,
					})),
		},
		[idsKey],
	);

	const trapResult = useLiveQuery(
		{
			gcTime: activityGcTimeMs,
			query: (query) =>
				query
					.from({ trap: traps })
					.where(({ trap }) => inArray(trap.address_id, queryIds))
					.select(({ trap }) => ({
						id: trap.id,
						addressId: trap.address_id,
						trapName: trap.trap_name,
						trapCode: trap.trap_code,
						isActive: trap.is_active,
					})),
		},
		[idsKey],
	);

	const habitatRows = habitatResult.data;
	const trapRows = trapResult.data;

	return useMemo(
		() => ({
			habitatsByAddress: groupByAddress(habitatRows, (habitat) => habitat),
			// Composed rather than projected: `trapDisplayName` falls back to a
			// substring of the id and the expression language has no substring.
			trapsByAddress: groupByAddress(trapRows, (trap) => ({
				id: trap.id,
				name: trapDisplayName(trap),
				isActive: trap.isActive,
			})),
			isReady: habitatResult.isReady && trapResult.isReady,
			isError: habitatResult.isError || trapResult.isError,
		}),
		[
			habitatRows,
			trapRows,
			habitatResult.isReady,
			habitatResult.isError,
			trapResult.isReady,
			trapResult.isError,
		],
	);
}

/**
 * The rows bucketed by the address they point at, each bucket sorted by name.
 *
 * The `Map` is the index exception `shared.ts` names: a query returns rows and
 * cannot return a lookup of them.
 */
export function groupByAddress<TRow extends { readonly addressId: string | null }>(
	rows: readonly TRow[],
	toLink: (row: TRow) => AddressRecordLink,
): ReadonlyMap<string, readonly AddressRecordLink[]> {
	const grouped = new Map<string, AddressRecordLink[]>();

	for (const row of rows) {
		// The predicate already excludes a null `address_id`; this is what tells the
		// type that.
		if (row.addressId === null) {
			continue;
		}
		const bucket = grouped.get(row.addressId);
		if (bucket === undefined) {
			grouped.set(row.addressId, [toLink(row)]);
		} else {
			bucket.push(toLink(row));
		}
	}

	for (const bucket of grouped.values()) {
		bucket.sort((left, right) => left.name.localeCompare(right.name));
	}

	return grouped;
}
