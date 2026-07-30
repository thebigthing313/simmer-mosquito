import type { AddressRow } from '@simmer-mosquito/sync';
import { describe, expect, it } from 'vitest';
import {
	addressCardLabel,
	addressPrimaryLabel,
	addressSecondaryLabel,
	formatAddressLine,
} from './address-format';

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

function addressRow(overrides: Partial<AddressRow> = {}): AddressRow {
	return {
		id: 'address-1',
		organizationId: 'organization-1',
		displayName: 'Riverside Pump House',
		country: 'US',
		addressLine1: '123 Main St',
		addressLine2: null,
		locality: 'Somewhere',
		region: 'WA',
		postalCode: '98101',
		geocoderResponse: null,
		createdByProfileId: null,
		updatedByProfileId: null,
		createdAt: '2026-01-01T00:00:00.000Z',
		updatedAt: '2026-01-01T00:00:00.000Z',
		...overrides,
	};
}
