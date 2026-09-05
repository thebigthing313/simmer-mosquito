/** @vitest-environment jsdom */

/**
 * Which placed shapes the address form adopts off the map.
 *
 * This one dropped what it refused. `adoptDrawnPoint` asked whether the shape
 * was a `Point` and returned on anything else, so a shape the draw control
 * offered and the guard had not heard of was placed, taken by the control, and
 * gone by the time the form saved, with nothing on screen to say so. That is the
 * Edit half of what the Region routes did before #474.
 *
 * The control and the guard now read one register, so they cannot come apart:
 * `GeometryControl` derives its draw toolbar and its file import from the
 * `address` policy, and this answers true for exactly that set.
 */

import { getOwnedGeometryPolicy } from '@simmer-mosquito/domain';
import { describe, expect, it } from 'vitest';
import type { DrawGeometry } from '../../../../../components/map/use-map-draw';
import { isAddressLocation } from '../../../../../routes/gis/addresses/-address-form';

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

describe('isAddressLocation', () => {
	it('takes the point an address sits at', () => {
		expect(isAddressLocation(POINT)).toBe(true);
	});

	it('refuses the shapes an address cannot store', () => {
		expect(isAddressLocation(LINE)).toBe(false);
		expect(isAddressLocation(POLYGON)).toBe(false);
		expect(isAddressLocation(MULTIPOLYGON)).toBe(false);
	});

	it('answers from the register rather than a shape name', () => {
		// The point of the predicate. Widening the policy has to widen this, and a
		// hand-written 'Point' would leave the adopt path dropping the new shape.
		expect(getOwnedGeometryPolicy('address').allowedTypes).toEqual(['Point']);
	});
});
