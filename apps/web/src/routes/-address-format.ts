import type { AddressRow } from '@simmer-mosquito/sync';

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
