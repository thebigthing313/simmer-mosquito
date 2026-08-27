/**
 * The agency's whole address book, alphabetical.
 *
 * The addresses explorer, which filters and pages over synced rows rather than
 * asking the server: an address book is a few thousand rows an agency curates,
 * not a season's accumulation.
 *
 * The centroid rides along because the explorer narrows by region against the
 * boundaries directly rather than server-side, and a point is what that test
 * takes. The full geometry still lives outside the shape.
 *
 * No org predicate — the shape is scoped to the agency server-side. See
 * `use-organization-service-requests.ts` for why re-stating it here is both
 * redundant and the thing that broke when the column name changed.
 */

import { useLiveQuery } from '@tanstack/react-db';
import { addresses } from '../../lib/collections/addresses';
import type { Address } from './address-view';
import { activityGcTimeMs } from './shared';

/** An Address as the explorer lists it: what to show, and where it is. */
export interface AddressListing extends Address {
	/**
	 * Not on `Address`, because the four shared formatters never print it — US is
	 * the default and appears on nearly every row. The explorer surfaces it only
	 * when it is something else, which is a question only the explorer asks.
	 */
	readonly country: string;
	readonly latitude: number | null;
	readonly longitude: number | null;
}

export function useOrganizationAddresses(): {
	readonly addresses: readonly AddressListing[];
	readonly isReady: boolean;
	readonly isError: boolean;
} {
	const result = useLiveQuery(
		{
			gcTime: activityGcTimeMs,
			query: (query) =>
				query
					.from({ address: addresses })
					.orderBy(({ address }) => address.display_name, 'asc')
					.select(({ address }) => ({
						id: address.id,
						displayName: address.display_name,
						addressLine1: address.address_line_1,
						addressLine2: address.address_line_2,
						locality: address.locality,
						region: address.region,
						postalCode: address.postal_code,
						country: address.country,
						latitude: address.lat,
						longitude: address.lng,
					})),
		},
		[],
	);

	return { addresses: result.data, isReady: result.isReady, isError: result.isError };
}
