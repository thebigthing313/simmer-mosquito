/** @vitest-environment jsdom */

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RegionMapCard } from '../../../../../components/gis/regions/region-map-card';
import { cleanupRenderedHooks, createFakeMap } from '../../map/fake-map';

vi.mock('../../../../../hooks/queries/use-region', () => ({
	useRegion: () => ({ region: undefined }),
}));

vi.mock('../../../../../hooks/queries/use-record-tags', () => ({
	useRecordTags: () => [],
}));

vi.mock('../../../../../hooks/use-region-geometry', () => ({
	useRegionGeometry: () => ({
		data: {
			geojson: {
				type: 'Polygon',
				coordinates: [
					[
						[-74.5, 40.3],
						[-74.4, 40.3],
						[-74.4, 40.4],
						[-74.5, 40.3],
					],
				],
			},
		},
	}),
}));

afterEach(() => {
	cleanup();
	cleanupRenderedHooks();
});

describe('RegionMapCard', () => {
	// The card's fit used to leave a flat 64 on the map, so every later selection
	// on the Regions explorer centred under the results panel (#1424).
	it('frames the region clear of the panel and leaves the panel inset on the map', () => {
		const fake = createFakeMap();
		const inset = { top: 0, right: 0, bottom: 0, left: 416 };
		fake.map.easeTo({ padding: inset, duration: 0 });

		render(<RegionMapCard id="region-1" map={fake.map} onClose={() => undefined} />);

		expect(fake.cameraCalls.at(-1)).toEqual(
			expect.objectContaining({
				kind: 'fitBounds',
				padding: { top: 64, right: 64, bottom: 64, left: 480 },
				retainPadding: false,
			}),
		);
		expect(fake.map.getPadding()).toEqual(inset);
	});
});
