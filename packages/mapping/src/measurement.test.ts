import { describe, expect, it } from 'vitest';
import {
	distanceMeters,
	formatArea,
	formatDistance,
	pathLengthMeters,
	polygonAreaMeters,
	polygonPerimeterMeters,
	rectanglePolygon,
	ringAreaMeters,
	ringPerimeterMeters,
} from './measurement.js';

describe('distanceMeters', () => {
	it('measures a known great-circle distance', () => {
		// JFK to LAX, a distance published to the metre in navigation references:
		// 3,982.9 km. Within a kilometre is what a spherical model gives.
		const jfk = { lng: -73.7789, lat: 40.6413 };
		const lax = { lng: -118.4085, lat: 33.9416 };

		expect(distanceMeters(jfk, lax) / 1000).toBeCloseTo(3974, -1);
	});

	it('measures a degree of latitude as about 111 km anywhere', () => {
		// Meridians are great circles, so this holds at any longitude and at any
		// latitude — the property that separates a spherical calculation from a
		// planar one.
		for (const lat of [0, 35, 60]) {
			const north = distanceMeters({ lng: -90, lat }, { lng: -90, lat: lat + 1 });
			expect(north / 1000).toBeCloseTo(111.2, 0);
		}
	});

	it('shrinks a degree of longitude with latitude', () => {
		// The failure a planar calculation makes: at 60° a degree of longitude is
		// half what it is at the equator.
		const atEquator = distanceMeters({ lng: 0, lat: 0 }, { lng: 1, lat: 0 });
		const atSixty = distanceMeters({ lng: 0, lat: 60 }, { lng: 1, lat: 60 });

		expect(atSixty / atEquator).toBeCloseTo(0.5, 2);
	});

	it('is zero for a point and itself, and symmetric otherwise', () => {
		const a = { lng: -90.5, lat: 35.5 };
		const b = { lng: -90.4, lat: 35.6 };

		expect(distanceMeters(a, a)).toBe(0);
		expect(distanceMeters(a, b)).toBeCloseTo(distanceMeters(b, a), 9);
	});
});

describe('pathLengthMeters', () => {
	it('sums its segments', () => {
		const a = { lng: -90.5, lat: 35.5 };
		const b = { lng: -90.4, lat: 35.5 };
		const c = { lng: -90.4, lat: 35.6 };

		expect(pathLengthMeters([a, b, c])).toBeCloseTo(distanceMeters(a, b) + distanceMeters(b, c), 6);
	});

	it('has no length below two points', () => {
		expect(pathLengthMeters([])).toBe(0);
		expect(pathLengthMeters([{ lng: -90.5, lat: 35.5 }])).toBe(0);
	});
});

describe('ringAreaMeters', () => {
	it('measures a one-degree box against its closed form', () => {
		// A graticule cell has an exact spherical area: R²·Δλ·(sin φ₂ − sin φ₁).
		// Checking against the formula rather than a remembered figure, because a
		// remembered figure is how you end up asserting a rounder number than the
		// right one.
		const radius = 6_371_008.8;
		const toRadians = Math.PI / 180;
		const expected = radius * radius * (1 * toRadians) * (Math.sin(1 * toRadians) - 0);

		const box = ringAreaMeters([
			{ lng: 0, lat: 0 },
			{ lng: 1, lat: 0 },
			{ lng: 1, lat: 1 },
			{ lng: 0, lat: 1 },
		]);

		expect(box).toBeCloseTo(expected, 0);
		expect(box / 1_000_000).toBeCloseTo(12_364, 0);
	});

	it('shrinks the same box towards the pole', () => {
		const equator = ringAreaMeters([
			{ lng: 0, lat: 0 },
			{ lng: 1, lat: 0 },
			{ lng: 1, lat: 1 },
			{ lng: 0, lat: 1 },
		]);
		const high = ringAreaMeters([
			{ lng: 0, lat: 60 },
			{ lng: 1, lat: 60 },
			{ lng: 1, lat: 61 },
			{ lng: 0, lat: 61 },
		]);

		expect(high).toBeLessThan(equator * 0.55);
		expect(high).toBeGreaterThan(equator * 0.45);
	});

	it('ignores winding order', () => {
		const clockwise = [
			{ lng: 0, lat: 0 },
			{ lng: 0, lat: 1 },
			{ lng: 1, lat: 1 },
			{ lng: 1, lat: 0 },
		];

		expect(ringAreaMeters(clockwise)).toBeCloseTo(ringAreaMeters([...clockwise].reverse()), 6);
	});

	it('does not count a repeated closing point twice', () => {
		const open = [
			{ lng: 0, lat: 0 },
			{ lng: 1, lat: 0 },
			{ lng: 1, lat: 1 },
			{ lng: 0, lat: 1 },
		];

		expect(ringAreaMeters([...open, open[0] as { lng: number; lat: number }])).toBeCloseTo(
			ringAreaMeters(open),
			6,
		);
	});

	it('has no area below three points', () => {
		expect(ringAreaMeters([])).toBe(0);
		expect(
			ringAreaMeters([
				{ lng: 0, lat: 0 },
				{ lng: 1, lat: 0 },
			]),
		).toBe(0);
	});
});

describe('polygon measurement', () => {
	const square = rectanglePolygon({ lng: -90.5, lat: 35.5 }, { lng: -90.49, lat: 35.51 });

	it('measures a polygon as its outer ring', () => {
		expect(polygonAreaMeters(square)).toBeCloseTo(
			ringAreaMeters([
				{ lng: -90.5, lat: 35.5 },
				{ lng: -90.49, lat: 35.5 },
				{ lng: -90.49, lat: 35.51 },
				{ lng: -90.5, lat: 35.51 },
			]),
			3,
		);
	});

	it('subtracts a hole from the area but not from the perimeter', () => {
		// Holes are not walls: a marsh with an island in it has the island's
		// shoreline inside, and an agency treating the marsh does not walk it.
		const withHole = {
			type: 'Polygon' as const,
			coordinates: [
				square.coordinates[0] as readonly (readonly [number, number])[],
				rectanglePolygon({ lng: -90.496, lat: 35.504 }, { lng: -90.494, lat: 35.506 })
					.coordinates[0] as readonly (readonly [number, number])[],
			],
		};

		expect(polygonAreaMeters(withHole)).toBeLessThan(polygonAreaMeters(square));
		expect(polygonPerimeterMeters(withHole)).toBeCloseTo(polygonPerimeterMeters(square), 6);
	});

	it('walks a rectangle’s perimeter as twice its two side lengths', () => {
		const width = distanceMeters({ lng: -90.5, lat: 35.5 }, { lng: -90.49, lat: 35.5 });
		const height = distanceMeters({ lng: -90.5, lat: 35.5 }, { lng: -90.5, lat: 35.51 });

		// Not exactly 2(w+h): the northern edge is shorter than the southern one,
		// because meridians converge. Within a percent over this span.
		expect(polygonPerimeterMeters(square)).toBeGreaterThan(2 * (width + height) * 0.99);
		expect(polygonPerimeterMeters(square)).toBeLessThan(2 * (width + height) * 1.01);
	});

	it('measures nothing for an empty polygon', () => {
		expect(polygonAreaMeters({ type: 'Polygon', coordinates: [] })).toBe(0);
		expect(polygonPerimeterMeters({ type: 'Polygon', coordinates: [] })).toBe(0);
		expect(ringPerimeterMeters([])).toBe(0);
	});
});

describe('rectanglePolygon', () => {
	it('spans the same box whichever corners it is given', () => {
		const one = rectanglePolygon({ lng: -90.5, lat: 35.5 }, { lng: -90.4, lat: 35.6 });
		const other = rectanglePolygon({ lng: -90.4, lat: 35.6 }, { lng: -90.5, lat: 35.5 });

		expect(one).toEqual(other);
	});

	it('produces a closed ring', () => {
		const ring = rectanglePolygon({ lng: -90.5, lat: 35.5 }, { lng: -90.4, lat: 35.6 })
			.coordinates[0] as readonly (readonly number[])[];

		expect(ring).toHaveLength(5);
		expect(ring[0]).toEqual(ring[4]);
	});
});

describe('formatDistance', () => {
	it('reads short distances in feet and long ones in miles', () => {
		expect(formatDistance(30.48)).toBe('100.0 ft');
		expect(formatDistance(16_093.44)).toBe('10.00 mi');
	});

	it('reads exactly one mile as one mile', () => {
		// A mile converts to 5279.999… feet, so a threshold checked in feet prints
		// "5,280 ft" here — right to the digit and wrong to read.
		expect(formatDistance(1609.344)).toBe('1.00 mi');
	});

	it('drops the decimal once feet get long enough not to need it', () => {
		expect(formatDistance(304.8)).toBe('1,000 ft');
	});

	it('reads metric in metres and kilometres', () => {
		expect(formatDistance(50, 'metric')).toBe('50.0 m');
		expect(formatDistance(500, 'metric')).toBe('500 m');
		expect(formatDistance(1500, 'metric')).toBe('1.50 km');
	});

	it('says zero rather than nothing for an unmeasured shape', () => {
		expect(formatDistance(0)).toBe('0 ft');
		expect(formatDistance(Number.NaN)).toBe('0 ft');
		expect(formatDistance(-5, 'metric')).toBe('0 m');
	});
});

describe('formatArea', () => {
	it('reads treatment-sized areas in acres', () => {
		expect(formatArea(4046.8564224)).toBe('1.00 acres');
		expect(formatArea(40_468.564224)).toBe('10.00 acres');
	});

	it('keeps small areas in square feet rather than a meaningless fraction', () => {
		// "0.01 acres" carries no information; 400 ft² does.
		expect(formatArea(37.16)).toMatch(/ft²$/);
	});

	it('moves to square miles at district scale', () => {
		expect(formatArea(2_589_988.110336)).toBe('1.00 sq mi');
	});

	it('reads metric in square metres, hectares, and square kilometres', () => {
		expect(formatArea(500, 'metric')).toBe('500 m²');
		expect(formatArea(50_000, 'metric')).toBe('5.00 ha');
		expect(formatArea(5_000_000, 'metric')).toBe('5.00 km²');
	});

	it('says zero rather than nothing for an unmeasured shape', () => {
		expect(formatArea(0)).toBe('0 ft²');
		expect(formatArea(Number.NaN, 'metric')).toBe('0 m²');
	});
});
