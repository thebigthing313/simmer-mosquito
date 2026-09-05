/** @vitest-environment jsdom */

/**
 * Which drawn shapes the Region form hands on to the write seam.
 *
 * The draw control lets a Region be built in pieces, and the routes used to ask
 * whether what came back was a `Polygon`. It never is once the user adds a
 * second piece: create refused a boundary that was on the map in front of them,
 * and edit dropped the redraw and saved the rest of the form without it.
 *
 * So the predicate reads the register rather than a shape name, and these are
 * the two answers that matter: both areal shapes pass, and nothing else does.
 */

import { describe, expect, it } from 'vitest';
import type { DrawGeometry } from '../../../../../components/map/use-map-draw';
import { isRegionBoundary } from '../../../../../routes/gis/regions/-region-form';

const RING = [
	[-74.4, 40.5],
	[-74.3, 40.5],
	[-74.3, 40.6],
	[-74.4, 40.5],
] as const;

const POLYGON: DrawGeometry = { type: 'Polygon', coordinates: [RING] };
const MULTIPOLYGON: DrawGeometry = { type: 'MultiPolygon', coordinates: [[RING]] };
const POINT: DrawGeometry = { type: 'Point', coordinates: [-74.35, 40.55] };
const LINE: DrawGeometry = { type: 'LineString', coordinates: [...RING] };

describe('isRegionBoundary', () => {
	it('takes a Region drawn in one piece', () => {
		expect(isRegionBoundary(POLYGON)).toBe(true);
	});

	it('takes a Region drawn in several', () => {
		expect(isRegionBoundary(MULTIPOLYGON)).toBe(true);
	});

	it('refuses the shapes a Region cannot store', () => {
		expect(isRegionBoundary(POINT)).toBe(false);
		expect(isRegionBoundary(LINE)).toBe(false);
	});
});
