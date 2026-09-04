/**
 * One Address, with everything its own pages edit and show.
 *
 * Wider than `use-address.ts`, which answers "where was this record worked" for
 * the surfaces that hold an `address_id` and nothing else. This is for the
 * address's own detail and edit pages, and for the party row on a service
 * request: the columns a form writes back, plus the centroid the map needs.
 *
 * `addresses` is on-demand, so this uses the status-gated `useLiveQuery` rather
 * than the suspense variant — the suspense hook sticks after a navigation unmount
 * over an on-demand collection. `isReady` is returned for the same reason it is
 * on `use-address.ts`: "no such address" and "it has not arrived yet" both read
 * as `undefined`, and the difference decides between a not-found page and a
 * skeleton.
 */

import { eq, useLiveQuery } from '@tanstack/react-db';
import { addresses } from '../../lib/collections/addresses';
import { mapCardGcTimeMs, unmatchableId } from './shared';

/** An Address as its own pages read one. */
export interface AddressRecord {
	readonly id: string;
	readonly displayName: string;
	readonly country: string;
	readonly addressLine1: string | null;
	readonly addressLine2: string | null;
	readonly locality: string | null;
	readonly region: string | null;
	readonly postalCode: string | null;
	readonly geocoderResponse: unknown;
	readonly latitude: number;
	readonly longitude: number;
}

export function useAddressRecord(addressId: string | null | undefined): {
	readonly address: AddressRecord | undefined;
	readonly isReady: boolean;
	readonly isError: boolean;
} {
	const id = addressId ?? unmatchableId;

	const result = useLiveQuery(
		{
			gcTime: mapCardGcTimeMs,
			query: (query) =>
				query
					.from({ address: addresses() })
					.where(({ address }) => eq(address.id, id))
					.select(({ address }) => ({
						id: address.id,
						displayName: address.display_name,
						country: address.country,
						addressLine1: address.address_line_1,
						addressLine2: address.address_line_2,
						locality: address.locality,
						region: address.region,
						postalCode: address.postal_code,
						geocoderResponse: address.geocoder_response,
						latitude: address.lat,
						longitude: address.lng,
					})),
		},
		[id],
	);

	return { address: result.data[0], isReady: result.isReady, isError: result.isError };
}
