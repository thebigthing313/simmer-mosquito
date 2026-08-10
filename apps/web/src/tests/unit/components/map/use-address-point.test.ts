import type { AddressRow } from '@simmer-mosquito/sync';
import { describe, expect, it } from 'vitest';
import { addressCoordOf, pointAt } from '../../../../components/map/use-address-point';

describe('address coordinates', () => {
	it('reads the synced centroid off a picked address', () => {
		expect(addressCoordOf(addressRow())).toEqual({ lat: 47.61, lng: -122.33 });
	});

	it('reports no coordinate for a cleared address or a row missing its centroid', () => {
		const { lat: _lat, lng: _lng, ...withoutCentroid } = addressRow();

		expect(addressCoordOf(null)).toBeNull();
		expect(addressCoordOf(withoutCentroid)).toBeNull();
	});

	it('builds a GeoJSON point in lng/lat order', () => {
		expect(pointAt({ lat: 47.61, lng: -122.33 })).toEqual({
			type: 'Point',
			coordinates: [-122.33, 47.61],
		});
	});
});

function addressRow(overrides: Partial<AddressRow> = {}): AddressRow {
	return {
		id: 'address-1',
		organizationId: 'organization-1',
		lat: 47.61,
		lng: -122.33,
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
