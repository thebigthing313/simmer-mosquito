/**
 * The Address a record was worked at.
 *
 * Records carry an `address_id` and nothing else, so every surface that names
 * where work happened resolves it through here: the detail rows, the map cards,
 * and the inspection card that also uses it as a fallback title.
 *
 * Takes a nullable id, because most of those records have no Address and a hook
 * cannot be called conditionally. The absent case asks for an id no row has, which
 * is an empty result rather than the whole table.
 *
 * `isReady` matters here and is returned rather than hidden. `addresses` is
 * on-demand, so "no Address" and "the Address has not arrived yet" both read as
 * `undefined`, and the difference is what decides between an em dash and a
 * skeleton.
 */

import { eq, useLiveQuery } from '@tanstack/react-db';
import { addresses } from '../../lib/collections/addresses';
import type { Address } from './address-view';
import { mapCardGcTimeMs, unmatchableId } from './shared';

export function useAddress(addressId: string | null | undefined): {
	readonly address: Address | undefined;
	readonly isReady: boolean;
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
						addressLine1: address.address_line_1,
						addressLine2: address.address_line_2,
						locality: address.locality,
						region: address.region,
						postalCode: address.postal_code,
					})),
		},
		[id],
	);

	return { address: result.data[0], isReady: result.isReady };
}
