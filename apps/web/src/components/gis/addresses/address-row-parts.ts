/**
 * An address as `/map/addresses` lists it, and the lines the Address Book Map
 * and the Addresses Table both write out of it.
 */

/**
 * What the row shows, and where on the map it sits. The whole postal address
 * rides along because the row's subtitle is what the title has not said, and
 * `country` because the rail surfaces it only when it is something other than
 * the US default.
 */
export interface AddressListing {
	readonly id: string;
	readonly lat: number;
	readonly lng: number;
	readonly displayName: string;
	readonly country: string;
	readonly addressLine1: string | null;
	readonly addressLine2: string | null;
	readonly locality: string | null;
	readonly region: string | null;
	readonly postalCode: string | null;
}

/** The complete postal address as a readable line: street, unit · city, state postal · country. */
export function fullAddress(address: AddressListing): string {
	const cityStateZip = joinParts(
		[joinParts([address.locality, address.region], ', '), address.postalCode],
		' ',
	);
	// US is the default and appears on nearly every row, so only surface a country
	// when it adds information.
	const country = address.country.trim() === 'US' ? null : address.country;
	return joinParts([streetLine(address), cityStateZip, country], ' · ');
}

/** The street and unit lines as one, empty when the address has neither. */
export function streetLine(address: AddressListing): string {
	return joinParts([address.addressLine1, address.addressLine2], ', ');
}

/**
 * What an address is called: its display name, else its postal line, else a
 * placeholder, so no row draws an empty title.
 */
export function addressName(address: AddressListing): string {
	return address.displayName.trim() || fullAddress(address) || 'Unnamed address';
}

function joinParts(parts: readonly (string | null | undefined)[], separator: string): string {
	return parts
		.map((part) => part?.trim() ?? '')
		.filter((part) => part.length > 0)
		.join(separator);
}
