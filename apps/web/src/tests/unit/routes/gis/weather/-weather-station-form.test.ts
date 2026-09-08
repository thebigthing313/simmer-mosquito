/** @vitest-environment jsdom */

/**
 * Which placed shapes the weather station form hands on to the write seam.
 *
 * The two routes used to ask whether what came back was a `Point`. That is the
 * right answer today and only by coincidence: it agrees with the register
 * because `weatherStation` is point-only, not because anything holds the two
 * together. The Region routes asked the same question about a `Polygon` and
 * refused a boundary that was on the map the day a Region could be multipart.
 *
 * So the predicate reads `allowedTypes` off the register, and these are the
 * answers that matter: a point passes, nothing else does, and the set it reads
 * is the station policy rather than a name written here.
 */

import { getOwnedGeometryPolicy } from '@simmer-mosquito/domain';
import { describe, expect, it } from 'vitest';
import type { DrawGeometry } from '../../../../../components/map/use-map-draw';
import { isStationLocation } from '../../../../../routes/gis/weather/-weather-station-form';

const RING = [
	[-74.4, 40.5],
	[-74.3, 40.5],
	[-74.3, 40.6],
	[-74.4, 40.5],
] as const;

const POINT: DrawGeometry = { type: 'Point', coordinates: [-74.35, 40.55] };
const LINE: DrawGeometry = { type: 'LineString', coordinates: [...RING] };
const POLYGON: DrawGeometry = { type: 'Polygon', coordinates: [RING] };
const MULTIPOLYGON: DrawGeometry = { type: 'MultiPolygon', coordinates: [[RING]] };

describe('isStationLocation', () => {
	it('takes the point a station stands on', () => {
		expect(isStationLocation(POINT)).toBe(true);
	});

	it('refuses the shapes a station cannot store', () => {
		expect(isStationLocation(LINE)).toBe(false);
		expect(isStationLocation(POLYGON)).toBe(false);
		expect(isStationLocation(MULTIPOLYGON)).toBe(false);
	});

	it('answers from the register rather than a shape name', () => {
		// The point of the predicate. Widening the policy has to widen this, and a
		// hand-written 'Point' would leave the routes behind on the day it moves.
		expect(getOwnedGeometryPolicy('weatherStation').allowedTypes).toEqual(['Point']);
	});
});
