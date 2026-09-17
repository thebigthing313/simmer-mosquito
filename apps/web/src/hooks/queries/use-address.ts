/**
 * The Address a record was worked at.
 *
 * Records carry an `address_id` and nothing else, so every surface that names
 * where work happened resolves it through here: the detail rows, the map cards,
 * and the inspection card that also uses it as a fallback title.
 *
 * Takes a nullable id, because most of those records have no Address, which is
 * {@link useRecordById}'s absent case.
 *
 * `isReady` matters here and is returned rather than hidden. `addresses` is
 * on-demand, so "no Address" and "the Address has not arrived yet" both read as
 * `undefined`, and the difference is what decides between an em dash and a
 * skeleton. `isError` is not: a caller here is naming a place beside something
 * else, and there is no retry to offer for a line under a heading.
 */

import { addresses } from '../../lib/collections/addresses';
import type { Address } from './address-view';
import { addressSelect, useRecordById } from './shared';

export function useAddress(addressId: string | null | undefined): {
	readonly address: Address | undefined;
	readonly isReady: boolean;
} {
	const result = useRecordById({
		collection: addresses(),
		id: addressId ?? null,
		query: (query) => query.select(({ record: address }) => addressSelect(address)),
	});

	return { address: result.record, isReady: result.isReady };
}
