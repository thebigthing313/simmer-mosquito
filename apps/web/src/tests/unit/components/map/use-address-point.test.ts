import { describe, expect, it } from 'vitest';
import {
	type AddressPoint,
	addressCoordOf,
	pointAt,
} from '../../../../components/map/use-address-point';

describe('address coordinates', () => {
	it('reads the synced centroid off a picked address', () => {
		expect(addressCoordOf(addressRow())).toEqual({ lat: 47.61, lng: -122.33 });
	});

	it('reports no coordinate for a cleared address or a row missing its centroid', () => {
		const { lat: _lat, lng: _lng, ...withoutCentroid } = addressRow();

		expect(addressCoordOf(null)).toBeNull();
		expect(addressCoordOf({ ...withoutCentroid, lat: null, lng: null })).toBeNull();
	});

	it('builds a GeoJSON point in lng/lat order', () => {
		expect(pointAt({ lat: 47.61, lng: -122.33 })).toEqual({
			type: 'Point',
			coordinates: [-122.33, 47.61],
		});
	});
});

/**
 * Only the centroid, because that is all `addressCoordOf` reads.
 *
 * It used to build a whole `AddressRow`, which said the subject needed a
 * complete address row when it needs two optional numbers — and pinned the test
 * to a row type the app no longer holds.
 */
function addressRow(overrides: Partial<AddressPoint> = {}): AddressPoint {
	return { lat: 47.61, lng: -122.33, ...overrides };
}
