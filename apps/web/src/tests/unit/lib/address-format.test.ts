import { describe, expect, it } from 'vitest';
import {
	addressCardLabel,
	addressPrimaryLabel,
	addressSecondaryLabel,
	formatAddressLine,
	formatAddressLines,
} from '../../../lib/address-format';

describe('address labels', () => {
	it('shows the address name on top and the postal line beneath', () => {
		const address = addressRow();

		expect(addressPrimaryLabel(address)).toBe('Riverside Pump House');
		expect(addressSecondaryLabel(address)).toBe('123 Main St, Somewhere, WA 98101');
	});

	it('drops the subtext when the name already is the postal line', () => {
		const address = addressRow({
			displayName: '123 Main St',
			locality: null,
			region: null,
			postalCode: null,
		});

		expect(addressPrimaryLabel(address)).toBe('123 Main St');
		expect(addressSecondaryLabel(address)).toBeNull();
	});

	it('falls back to the postal line, then a short id, when the name is blank', () => {
		expect(addressPrimaryLabel(addressRow({ displayName: '  ' }))).toBe(
			'123 Main St, Somewhere, WA 98101',
		);
		expect(
			addressPrimaryLabel(
				addressRow({
					displayName: '',
					addressLine1: null,
					locality: null,
					region: null,
					postalCode: null,
				}),
			),
		).toBe('Address address-');
	});

	it('joins only the postal parts that are present', () => {
		expect(formatAddressLine(addressRow({ addressLine2: 'Unit 4', postalCode: null }))).toBe(
			'123 Main St, Unit 4, Somewhere, WA',
		);
		expect(addressCardLabel(undefined)).toBeNull();
	});
});

describe('formatAddressLines', () => {
	// The street on its own line, everything that qualifies it on the next —
	// what an envelope carries, and what a reader copying an address or saying
	// it down a phone expects. The single-line form stays for map cards.
	it('breaks after the street', () => {
		expect(formatAddressLines(addressRow())).toEqual(['123 Main St', 'Somewhere, WA 98101']);
	});

	it('keeps a unit with the qualifiers, not the street', () => {
		expect(formatAddressLines(addressRow({ addressLine2: 'Apt 4' }))).toEqual([
			'123 Main St',
			'Apt 4, Somewhere, WA 98101',
		]);
	});

	// An address with only a street is one line, not a line and a blank.
	it('drops the parts that are not there', () => {
		expect(
			formatAddressLines(
				addressRow({ locality: null, region: null, postalCode: null, addressLine2: null }),
			),
		).toEqual(['123 Main St']);
		expect(formatAddressLines(addressRow({ addressLine1: null }))).toEqual(['Somewhere, WA 98101']);
		expect(
			formatAddressLines(
				addressRow({
					addressLine1: null,
					addressLine2: null,
					locality: null,
					region: null,
					postalCode: null,
				}),
			),
		).toEqual([]);
	});

	it('says the same thing the single line does, split', () => {
		const address = addressRow({ addressLine2: 'Apt 4' });

		expect(formatAddressLines(address).join(', ')).toBe(formatAddressLine(address));
	});
});

/**
 * The five parts the formatters read, and nothing else.
 *
 * `formatAddressLine` takes a structural `AddressParts`; building a whole
 * address row here claimed a dependency the code does not have.
 */
function addressRow(overrides: Partial<AddressLineParts> = {}): AddressLineParts {
	return {
		id: 'address-1',
		displayName: 'Riverside Pump House',
		addressLine1: '123 Main St',
		addressLine2: null,
		locality: 'Somewhere',
		region: 'WA',
		postalCode: '98101',
		...overrides,
	};
}

interface AddressLineParts {
	readonly id: string;
	readonly displayName: string | null;
	readonly addressLine1: string | null;
	readonly addressLine2: string | null;
	readonly locality: string | null;
	readonly region: string | null;
	readonly postalCode: string | null;
}
