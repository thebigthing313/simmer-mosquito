import { describe, expect, it } from 'vitest';
import { formatLatLng, parseLatLng } from '../../coordinates.js';

describe('formatLatLng', () => {
	it('reads latitude first, at six places', () => {
		expect(formatLatLng(42.3601, -71.0589)).toBe('42.360100, -71.058900');
	});

	it('pads rather than rounding away a whole coordinate', () => {
		expect(formatLatLng(0, 0)).toBe('0.000000, 0.000000');
	});
});

describe('parseLatLng', () => {
	const point = (lat: number, lng: number) => ({ ok: true, point: { lng, lat } });

	it('reads a pair split by a comma, by spaces, or by both', () => {
		expect(parseLatLng('40.123456, -74.123456')).toEqual(point(40.123456, -74.123456));
		expect(parseLatLng('40.123456,-74.123456')).toEqual(point(40.123456, -74.123456));
		expect(parseLatLng('40.123456 -74.123456')).toEqual(point(40.123456, -74.123456));
		expect(parseLatLng('40.123456   -74.123456')).toEqual(point(40.123456, -74.123456));
		expect(parseLatLng('40.123456 , -74.123456')).toEqual(point(40.123456, -74.123456));
		expect(parseLatLng('40.123456\t-74.123456')).toEqual(point(40.123456, -74.123456));
	});

	it('ignores whitespace around the pair', () => {
		expect(parseLatLng('  40.1, -74.2 \n')).toEqual(point(40.1, -74.2));
	});

	it('reads whole numbers, signs and bare fractions', () => {
		expect(parseLatLng('40 -74')).toEqual(point(40, -74));
		expect(parseLatLng('+40.5, +74.5')).toEqual(point(40.5, 74.5));
		expect(parseLatLng('.5, -.25')).toEqual(point(0.5, -0.25));
	});

	it('reads back what Copy coordinates writes', () => {
		for (const [lat, lng] of [
			[40.123456, -74.123456],
			[0, 0],
			[-33.868819, 151.209295],
			[90, 180],
			[-90, -180],
		] as const) {
			expect(parseLatLng(formatLatLng(lat, lng))).toEqual(point(lat, lng));
		}
	});

	it('takes the range limits themselves', () => {
		expect(parseLatLng('90, 180')).toEqual(point(90, 180));
		expect(parseLatLng('-90, -180')).toEqual(point(-90, -180));
	});

	it('refuses a latitude past 90 or a longitude past 180', () => {
		const outOfRange = { ok: false, reason: 'out-of-range' };
		expect(parseLatLng('90.000001, 0')).toEqual(outOfRange);
		expect(parseLatLng('-91, 0')).toEqual(outOfRange);
		expect(parseLatLng('0, 180.000001')).toEqual(outOfRange);
		expect(parseLatLng('0, -181')).toEqual(outOfRange);
		// Longitude first reads as out of range when the longitude is past 90.
		// East of that, the swapped pair is a real point and nothing can refuse it.
		expect(parseLatLng('-118.2437, 34.0522')).toEqual(outOfRange);
	});

	it('refuses text that is not two decimal numbers', () => {
		const unreadable = { ok: false, reason: 'unreadable' };
		for (const text of [
			'',
			'   ',
			'40.1',
			'40.1,',
			', -74.1',
			'40.1, -74.1, 12',
			'40.1;-74.1',
			'40.1,,-74.1',
			"40°7'N 74°7'W",
			'40.1N, 74.1W',
			'1e1, 2',
			'NaN, 0',
			'Infinity, 0',
			'0x10, 0',
			'abc def',
		]) {
			expect(parseLatLng(text), text).toEqual(unreadable);
		}
	});
});
