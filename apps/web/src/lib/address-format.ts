import type { AddressRow } from '@simmer-mosquito/sync';

// Kept off the routes layer so shared components (the address picker) and route
// views format an address identically.

/** The structural address fields the formatters read (satisfied by {@link AddressRow}). */
type AddressParts = Pick<
	AddressRow,
	'addressLine1' | 'addressLine2' | 'locality' | 'region' | 'postalCode'
>;

/**
 * The full postal address as one readable line — `line1, line2, locality, region
 * zip` — with empty parts dropped. This is the service-request card's address
 * format, shared by every card that surfaces an address so they read identically.
 */
export function formatAddressLine(address: AddressParts): string {
	const regionZip = [address.region, address.postalCode]
		.map((value) => value?.trim() ?? '')
		.filter((value) => value.length > 0)
		.join(' ');
	return [address.addressLine1, address.addressLine2, address.locality, regionZip]
		.map((value) => value?.trim() ?? '')
		.filter((value) => value.length > 0)
		.join(', ');
}

/**
 * The same address as the lines an envelope would carry: the street on its own,
 * then everything that qualifies it.
 *
 * A detail page has the room, and a postal address read as one comma-run —
 * `123 Main St, Apt 4, Edison, NJ 08817` — makes the reader parse where the
 * street ends before they can copy it or read it down a phone. Map cards keep
 * {@link formatAddressLine}, where the single line is what fits.
 *
 * Empty parts drop out, so an address with only a street is one line rather
 * than a line and a blank.
 */
export function formatAddressLines(address: AddressParts): readonly string[] {
	const regionZip = [address.region, address.postalCode]
		.map((value) => value?.trim() ?? '')
		.filter((value) => value.length > 0)
		.join(' ');
	const rest = [address.addressLine2, address.locality, regionZip]
		.map((value) => value?.trim() ?? '')
		.filter((value) => value.length > 0)
		.join(', ');

	return [address.addressLine1?.trim() ?? '', rest].filter((line) => line.length > 0);
}

/**
 * The address label for a map card: the full {@link formatAddressLine}, falling
 * back to the friendly `displayName`, then `null` (no address / not yet loaded).
 */
export function addressCardLabel(
	address: (AddressParts & { readonly displayName: string | null }) | undefined,
): string | null {
	if (address === undefined) {
		return null;
	}
	return formatAddressLine(address).trim() || address.displayName?.trim() || null;
}

/**
 * The address's own name, which every list and picker shows as the primary line.
 * Falls back to the postal line, then a short id, so a row is never blank.
 */
export function addressPrimaryLabel(
	address: AddressParts & { readonly id: string; readonly displayName: string | null },
): string {
	return (
		address.displayName?.trim() ||
		formatAddressLine(address).trim() ||
		`Address ${address.id.slice(0, 8)}`
	);
}

/**
 * The postal line to show *beneath* {@link addressPrimaryLabel} — `null` when it
 * is empty or when the name already is the postal line (no echoed subtext).
 */
export function addressSecondaryLabel(
	address: AddressParts & { readonly id: string; readonly displayName: string | null },
): string | null {
	const line = formatAddressLine(address).trim();
	if (line.length === 0 || line === addressPrimaryLabel(address)) {
		return null;
	}
	return line;
}

/**
 * {@link addressSecondaryLabel} as lines rather than one run, for the surfaces
 * with room for them. Empty for the same two reasons the single-line form
 * returns `null`.
 */
export function addressSecondaryLines(
	address: AddressParts & { readonly id: string; readonly displayName: string | null },
): readonly string[] {
	return addressSecondaryLabel(address) === null ? [] : formatAddressLines(address);
}
