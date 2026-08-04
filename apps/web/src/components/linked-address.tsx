import type { AddressRow } from '@simmer-mosquito/sync';
import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
import { MapPinnedIcon } from '@simmer-mosquito/ui-web/icons/registry';
import { eq, useLiveQuery } from '@tanstack/react-db';
import { Link } from '@tanstack/react-router';
import { addressPrimaryLabel, addressSecondaryLabel } from '../lib/address-format';
import { webCollections } from '../sync/webCollections';
import { EmptyValue } from './empty-value';
import { MapCardDetail } from './map/map-card';

/**
 * The address a record was worked at, wherever that record is read.
 *
 * Records carry an `addressId` and nothing else — the address itself lives in
 * the on-demand `addresses` collection — so every surface that wanted to show
 * one had to resolve it, and the ones that hadn't simply left it out. An
 * application's detail page named its habitat, its applicator, and its
 * insecticide but never said *where*, which is the first thing a resident asks
 * about on the phone.
 *
 * Both readouts show the address's own name **and** its postal line. Agencies
 * name addresses for their own navigation ("Riverside HOA clubhouse") and the
 * name alone will not get a crew there, while the postal line alone loses the
 * name the agency filed it under.
 */

const gcTimeMs = 30_000;
/** A sentinel no real row matches, so the query is inert when nothing is linked. */
const UNMATCHABLE_ID = '00000000-0000-0000-0000-000000000000';

export function useLinkedAddress(addressId: string | null | undefined): {
	readonly address: AddressRow | undefined;
	readonly isReady: boolean;
} {
	const id = addressId ?? UNMATCHABLE_ID;
	const result = useLiveQuery(
		{
			gcTime: gcTimeMs,
			query: (query) =>
				query
					.from({ address: webCollections.addresses })
					.where(({ address }) => eq(address.id, id))
					.findOne(),
		},
		[id],
	);

	return { address: result.data as AddressRow | undefined, isReady: result.isReady };
}

/**
 * The value side of an "Address" row on a record's detail page: the name over
 * the postal line, linked to the address itself. An em dash when the record
 * links none — a detail list is a list, and a sentence explaining the absence
 * would say more than the row is worth.
 */
export function LinkedAddressValue({ addressId }: { readonly addressId: string | null }) {
	const { address, isReady } = useLinkedAddress(addressId);

	if (addressId === null) {
		return <EmptyValue />;
	}
	if (address === undefined) {
		// Resolved-and-absent (deleted, or out of scope) reads the same as unlinked;
		// still streaming does not, so it waits rather than claiming there is none.
		return isReady ? <EmptyValue /> : <Skeleton className="h-4 w-36" />;
	}

	const secondary = addressSecondaryLabel(address);
	return (
		<div className="grid gap-0.5">
			<Link
				className="w-fit rounded-sm text-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				params={{ id: address.id }}
				to="/gis/addresses/$id"
			>
				{addressPrimaryLabel(address)}
			</Link>
			{secondary === null ? null : (
				<span className="text-muted-foreground text-xs">{secondary}</span>
			)}
		</div>
	);
}

/**
 * The address row of a map card. Reads "No linked address" rather than an em
 * dash: a card is prose-shaped, not tabular, and there is no column header
 * above it to say what the dash would be standing in for.
 */
export function MapCardAddress({ addressId }: { readonly addressId: string | null }) {
	const { address, isReady } = useLinkedAddress(addressId);

	if (addressId === null || (address === undefined && isReady)) {
		return (
			<MapCardDetail icon={MapPinnedIcon}>
				<span className="italic">No linked address</span>
			</MapCardDetail>
		);
	}
	if (address === undefined) {
		return (
			<MapCardDetail icon={MapPinnedIcon}>
				<Skeleton className="h-4 w-32" />
			</MapCardDetail>
		);
	}

	const secondary = addressSecondaryLabel(address);
	return (
		<MapCardDetail icon={MapPinnedIcon}>
			<span className="font-medium text-foreground">{addressPrimaryLabel(address)}</span>
			{secondary === null ? null : <span className="block">{secondary}</span>}
		</MapCardDetail>
	);
}
