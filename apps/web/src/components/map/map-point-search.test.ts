import { describe, expect, it } from 'vitest';
import { formatLatLng, mapPointSearchSchema, pointFromSearch } from './map-point-search';

/** What the router actually hands `validateSearch`: strings, or nothing. */
const parse = (raw: Record<string, unknown>) => mapPointSearchSchema.parse(raw);

describe('mapPointSearchSchema', () => {
	it('coerces the strings a URL carries into numbers', () => {
		expect(parse({ lat: '42.3601', lng: '-71.0589' })).toEqual({ lat: 42.3601, lng: -71.0589 });
	});

	it('leaves an ordinary create URL empty', () => {
		expect(parse({})).toEqual({ lat: undefined, lng: undefined });
	});

	it('discards coordinates that are off the globe', () => {
		expect(parse({ lat: '91', lng: '0' }).lat).toBeUndefined();
		expect(parse({ lat: '0', lng: '181' }).lng).toBeUndefined();
	});

	// A hand-edited or truncated link should open an empty form, not a route error.
	it('never throws on nonsense', () => {
		expect(() => parse({ lat: 'north', lng: {} })).not.toThrow();
		expect(parse({ lat: 'north', lng: {} })).toEqual({ lat: undefined, lng: undefined });
	});
});

describe('pointFromSearch', () => {
	it('writes GeoJSON order — longitude first — from a lat/lng URL', () => {
		expect(pointFromSearch({ lat: 42.3601, lng: -71.0589 })).toEqual({
			type: 'Point',
			coordinates: [-71.0589, 42.3601],
		});
	});

	it('seeds nothing without a coordinate', () => {
		expect(pointFromSearch({ lat: undefined, lng: undefined })).toBeNull();
	});

	/**
	 * Half a pair is a broken link, not half a location. Falling back to 0 for the
	 * missing half would put a pin in the Atlantic and let an operator save it.
	 */
	it('refuses a half pair rather than defaulting the other half', () => {
		expect(pointFromSearch({ lat: 42.3601, lng: undefined })).toBeNull();
		expect(pointFromSearch({ lat: undefined, lng: -71.0589 })).toBeNull();
	});

	it('keeps a coordinate on the equator or the prime meridian', () => {
		// Guards the `=== undefined` checks against ever becoming falsy checks: zero
		// is a real latitude and a real longitude.
		expect(pointFromSearch({ lat: 0, lng: 0 })).toEqual({ type: 'Point', coordinates: [0, 0] });
	});

	it('round-trips what the schema parsed', () => {
		expect(pointFromSearch(parse({ lat: '0', lng: '-71.0589' }))).toEqual({
			type: 'Point',
			coordinates: [-71.0589, 0],
		});
	});
});

describe('formatLatLng', () => {
	it('reads latitude first, at six places', () => {
		expect(formatLatLng(42.3601, -71.0589)).toBe('42.360100, -71.058900');
	});

	it('pads rather than rounding away a whole coordinate', () => {
		expect(formatLatLng(0, 0)).toBe('0.000000, 0.000000');
	});
});
