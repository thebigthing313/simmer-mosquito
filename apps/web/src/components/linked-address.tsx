import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
import { MapPinnedIcon } from '@simmer-mosquito/ui-web/icons/registry';
import { Link } from '@tanstack/react-router';
import { type LinkedAddress, resolveLinkedAddress } from '../hooks/queries/address-view';
import { useAddress } from '../hooks/queries/use-address';
import {
	addressPrimaryLabel,
	addressSecondaryLabel,
	addressSecondaryLines,
} from '../lib/address-format';
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
 *
 * ## Why these take the address rather than fetch it
 *
 * They used to take an `addressId` and resolve it themselves, which made every
 * card and detail page a two-step load: the record arrived, then this mounted and
 * asked for the address. A surface should be one query, so the surface's own hook
 * joins the address and hands it down. What is left here is the reading of it.
 *
 * The three states are distinguished by two props rather than a loading flag.
 * `addressId === null` is a record that links no address. An `address` that is
 * absent, or present with no `id`, is one that has not arrived — which is what an
 * unmatched `left` join looks like.
 */

/**
 * The value side of an "Address" row on a record's detail page: the name over
 * the postal line, linked to the address itself. An em dash when the record
 * links none — a detail list is a list, and a sentence explaining the absence
 * would say more than the row is worth.
 */
export function LinkedAddressValue({
	addressId,
	address: linked,
}: {
	readonly addressId: string | null;
	readonly address: LinkedAddress | undefined;
}) {
	const address = linked === undefined ? undefined : resolveLinkedAddress(linked);

	if (addressId === null) {
		return <EmptyValue />;
	}
	if (address === undefined) {
		// A record that names an address the app cannot see — deleted, or out of
		// scope — waits rather than claiming there is none. It is rare enough that a
		// permanent skeleton is the better wrong answer: an em dash would say the
		// record has no address, which is a different and more misleading claim.
		return <Skeleton className="h-4 w-36" />;
	}

	// Postal lines, not one comma-run: a detail row has the width, and a reader
	// copying an address or reading it down a phone should not have to work out
	// where the street ends. The map card below keeps the single line, where
	// that is what fits.
	const lines = addressSecondaryLines(address);
	return (
		<div className="grid gap-0.5">
			<Link
				className="w-fit rounded-sm text-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				params={{ id: address.id }}
				to="/gis/addresses/$id"
			>
				{addressPrimaryLabel(address)}
			</Link>
			{lines.map((line) => (
				<span className="text-muted-foreground text-xs" key={line}>
					{line}
				</span>
			))}
		</div>
	);
}

/**
 * The address row of a map card. Reads "No linked address" rather than an em
 * dash: a card is prose-shaped, not tabular, and there is no column header
 * above it to say what the dash would be standing in for.
 */
export function MapCardAddress({
	addressId,
	address: linked,
}: {
	readonly addressId: string | null;
	readonly address: LinkedAddress | undefined;
}) {
	const address = linked === undefined ? undefined : resolveLinkedAddress(linked);

	if (addressId === null) {
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

/*
 * ## The two `…ById` wrappers below are scaffolding
 *
 * They are the old behaviour — resolve the address from an id, here, after the
 * record has arrived — kept for the surfaces that have not moved to a joined
 * surface query yet. Each one is a second request the surface could have made in
 * its first.
 *
 * They are not a supported way to show an address. When the last caller of each
 * goes, `fallow dead-code` will say so and they should be deleted rather than
 * kept "in case". Do not add callers.
 */

/** {@link LinkedAddressValue} for a surface that has not joined its address yet. */
export function LinkedAddressValueById({ addressId }: { readonly addressId: string | null }) {
	const { address } = useAddress(addressId);
	return <LinkedAddressValue address={address} addressId={addressId} />;
}

/** {@link MapCardAddress} for a surface that has not joined its address yet. */
export function MapCardAddressById({ addressId }: { readonly addressId: string | null }) {
	const { address } = useAddress(addressId);
	return <MapCardAddress address={address} addressId={addressId} />;
}
