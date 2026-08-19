/**
 * Which commands a region edit is.
 *
 * One form, three commands: renaming a region, filing it somewhere else, and
 * redrawing its boundary are three different things to have done, and the domain
 * refuses any of them that arrives with nothing to change. So a save that names
 * all three whenever the user pressed Save fails on the two they did not touch,
 * and a save that names too few drops that part of the form behind a 200.
 *
 * The boundary is the one worth being careful about. It does not travel as a
 * column — `geom` never syncs — so nothing about the row can betray a redraw
 * that was not sent, or a re-send of the polygon the region already had. The
 * only signal is whether the caller passed one, which is why `geometry: null`
 * has to mean "not touched" rather than "cleared".
 */

import type { GeoJsonPolygon } from '@simmer-mosquito/mapping';
import { describe, expect, it } from 'vitest';
import {
	type RegionFields,
	regionUpdatePlan,
} from '../../../../hooks/mutations/use-region-mutations';

const FOLDER = '11111111-1111-4111-8111-111111111111';
const OTHER_FOLDER = '22222222-2222-4222-8222-222222222222';

const BOUNDARY: GeoJsonPolygon = {
	type: 'Polygon',
	coordinates: [
		[
			[-74.4, 40.5],
			[-74.3, 40.5],
			[-74.3, 40.6],
			[-74.4, 40.6],
			[-74.4, 40.5],
		],
	],
};

function fields(overrides: Partial<RegionFields> = {}): RegionFields {
	return {
		name: 'Zone 1',
		description: null,
		folderId: FOLDER,
		metadata: null,
		...overrides,
	};
}

function plan(overrides: {
	readonly fields?: RegionFields;
	readonly geometry?: GeoJsonPolygon | null;
}) {
	return regionUpdatePlan({
		fields: overrides.fields ?? fields(),
		current: fields(),
		geometry: overrides.geometry ?? null,
	});
}

describe('regionUpdatePlan', () => {
	it('names only the details command when only the name changed', () => {
		const result = plan({ fields: fields({ name: 'Zone 1 North' }) });

		expect(result?.intents).toEqual(['foundation.updateRegionDetails']);
		expect(result?.changes).toEqual({
			name: 'Zone 1 North',
			description: null,
			metadata: null,
		});
		expect(result?.arguments).toBeUndefined();
	});

	it('names only the move when only the folder changed', () => {
		const result = plan({ fields: fields({ folderId: OTHER_FOLDER }) });

		expect(result?.intents).toEqual(['foundation.moveRegionToFolder']);
		expect(result?.changes).toEqual({ region_folder_id: OTHER_FOLDER });
	});

	it('treats unfiling as a move, not as an absent folder', () => {
		// Present-and-null is how a region leaves a folder without joining another.
		// Read as "no folder arrived" it would be no move at all, and the region
		// would silently stay where it was.
		const result = plan({ fields: fields({ folderId: null }) });

		expect(result?.intents).toEqual(['foundation.moveRegionToFolder']);
		expect(result?.changes).toEqual({ region_folder_id: null });
	});

	it('carries a redrawn boundary as an argument, with the centroid beside it', () => {
		const result = plan({ geometry: BOUNDARY });

		expect(result?.intents).toEqual(['foundation.updateRegionGeometry']);
		expect(result?.arguments).toEqual({ geometry: BOUNDARY });
		// The centroid columns are the trigger's to maintain, and the server strips
		// them from the body — they are written so the map moves before it answers.
		// In the column's own vocabulary, which is PostGIS's rather than GeoJSON's.
		expect(result?.changes.geom_type).toBe('st_polygon');
		// Inside the ring, rather than an exact figure: how the centroid is
		// averaged is `packages/mapping`'s business and it has its own tests.
		expect(result?.changes.lat).toBeGreaterThan(40.5);
		expect(result?.changes.lat).toBeLessThan(40.6);
		expect(result?.changes.lng).toBeGreaterThan(-74.4);
		expect(result?.changes.lng).toBeLessThan(-74.3);
	});

	it('names all three when the whole form moved', () => {
		const result = plan({
			fields: fields({ name: 'Zone 2', folderId: OTHER_FOLDER }),
			geometry: BOUNDARY,
		});

		expect(result?.intents).toEqual([
			'foundation.updateRegionDetails',
			'foundation.moveRegionToFolder',
			'foundation.updateRegionGeometry',
		]);
	});

	it('is not a write when nothing moved', () => {
		expect(plan({})).toBeNull();
	});
});
