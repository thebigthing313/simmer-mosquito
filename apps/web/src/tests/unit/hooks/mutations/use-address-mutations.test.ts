/**
 * Which command an address edit is, and what the pin writes.
 *
 * The two commands are easy to get wrong in the usual way: naming the location
 * command on a save that only fixed a postcode is a write with nothing to do,
 * and the domain refuses one of those, so the whole save fails over the half the
 * user never touched.
 *
 * `geom_type` is the other half. The `addresses_centroid` trigger writes
 * `lower(st_geometrytype(new.geom))`, so the confirmed row says `st_point`. This
 * path used to write GeoJSON's `Point` into the optimistic row, and the readers
 * that normalize the column absorbed both casings, which meant nothing looked
 * broken while the two rows disagreed until Electric synced.
 */

import type { GeoJsonPoint } from '@simmer-mosquito/mapping';
import { describe, expect, it } from 'vitest';
import {
	type AddressFields,
	addressUpdatePlan,
} from '../../../../hooks/mutations/use-address-mutations';

const PIN: GeoJsonPoint = { type: 'Point', coordinates: [-74.35, 40.55] };

function fields(overrides: Partial<AddressFields> = {}): AddressFields {
	return {
		displayName: '12 Mill Road',
		addressLine1: '12 Mill Road',
		addressLine2: null,
		locality: 'Cranbury',
		region: 'NJ',
		postalCode: '08512',
		geocoderResponse: null,
		...overrides,
	};
}

function plan(overrides: {
	readonly fields?: AddressFields;
	readonly geometry?: GeoJsonPoint | null;
}) {
	return addressUpdatePlan({
		fields: overrides.fields ?? fields(),
		current: fields(),
		geometry: overrides.geometry ?? null,
	});
}

describe('addressUpdatePlan', () => {
	it('names only the details command when the pin was not moved', () => {
		const result = plan({ fields: fields({ postalCode: '08512-1234' }) });

		expect(result?.intents).toEqual(['foundation.updateAddressDetails']);
		expect(result?.changes).toEqual({
			display_name: '12 Mill Road',
			address_line_1: '12 Mill Road',
			address_line_2: null,
			locality: 'Cranbury',
			region: 'NJ',
			postal_code: '08512-1234',
			geocoder_response: null,
		});
		expect(result?.arguments).toBeUndefined();
	});

	it('names only the location command when only the pin moved', () => {
		const result = plan({ geometry: PIN });

		expect(result?.intents).toEqual(['foundation.updateAddressLocation']);
		expect(result?.changes).toEqual({ lat: 40.55, lng: -74.35, geom_type: 'st_point' });
		expect(result?.arguments).toEqual({ geometry: PIN });
	});

	it('writes the column vocabulary, not GeoJSON casing', () => {
		expect(plan({ geometry: PIN })?.changes.geom_type).toBe('st_point');
	});

	it('names both commands when the pin moved and a field changed', () => {
		const result = plan({ fields: fields({ locality: 'Plainsboro' }), geometry: PIN });

		expect(result?.intents).toEqual([
			'foundation.updateAddressDetails',
			'foundation.updateAddressLocation',
		]);
		expect(result?.changes.locality).toBe('Plainsboro');
		expect(result?.changes.geom_type).toBe('st_point');
	});

	it('is no write at all when nothing moved', () => {
		expect(plan({})).toBeNull();
	});
});
