/**
 * One Address, with everything its own pages edit and show.
 *
 * Wider than `use-address.ts`, which answers "where was this record worked" for
 * the surfaces that hold an `address_id` and nothing else. This is for the
 * address's own detail and edit pages, and for the party row on a service
 * request: the columns a form writes back, plus the centroid the map needs.
 *
 * `isReady` is returned for the same reason it is on `use-address.ts`: "no such
 * address" and "it has not arrived yet" both read as `undefined`, and the
 * difference decides between a not-found page and a skeleton.
 */

import { addresses } from '../../lib/collections/addresses';
import { addressSelect, useRecordById } from './shared';

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
	const result = useRecordById({
		collection: addresses(),
		id: addressId ?? null,
		query: (query) =>
			query.select(({ record: address }) => ({
				...addressSelect(address),
				country: address.country,
				geocoderResponse: address.geocoder_response,
				latitude: address.lat,
				longitude: address.lng,
			})),
	});

	return { address: result.record, isReady: result.isReady, isError: result.isError };
}
