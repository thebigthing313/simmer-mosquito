/**
 * Where a map opens before it has fitted anything (#1413).
 *
 * A surface with rows fits to them after the map loads, and that is
 * `use-map-extent-fit.ts`. What this covers is what the map shows before that,
 * which is all an empty surface ever shows: a camera the surface chose, then the
 * Organization's map centre, then the continental US.
 */

import { describe, expect, it } from 'vitest';
import {
	DEFAULT_MAP_CAMERA,
	type MapCamera,
	ORGANIZATION_MAP_ZOOM,
	openingMapCamera,
} from '../../../../components/map/map-styles';

const CENTER = { lat: 40.4316, lng: -74.4331 };

const CHOSEN: MapCamera = { center: [-74.2, 40.6], zoom: 14, bearing: 0, pitch: 0 };

describe('openingMapCamera', () => {
	it("keeps a camera the surface chose over the Organization's centre", () => {
		expect(openingMapCamera(CHOSEN, CENTER)).toBe(CHOSEN);
	});

	it("opens on the Organization's centre at the regional zoom when the surface chose none", () => {
		expect(openingMapCamera(undefined, CENTER)).toEqual({
			center: [-74.4331, 40.4316],
			zoom: ORGANIZATION_MAP_ZOOM,
			bearing: 0,
			pitch: 0,
		});
	});

	it('falls back to the continental US for an Organization with no centre stored', () => {
		expect(openingMapCamera(undefined, null)).toBe(DEFAULT_MAP_CAMERA);
	});
});
