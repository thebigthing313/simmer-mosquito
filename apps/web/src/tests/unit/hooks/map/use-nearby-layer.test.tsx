// @vitest-environment jsdom
/**
 * The service request context overlay's selection ring.
 *
 * A habitat merge selects several nearby records at once, and a basemap switch
 * re-adds every layer from its spec, so the ring has to come back on all of
 * them rather than on none (#1426).
 */
import type { Map as MapboxMap } from 'mapbox-gl';
import { act } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { type NearbyLayerConfig, useNearbyLayer } from '../../../../hooks/map/use-nearby-layer';
import { cleanupRenderedHooks, createFakeMap, renderHook } from '../../components/map/fake-map';

const SELECTED_LAYER_ID = 'nearby-context-selected';

const DATA: GeoJSON.FeatureCollection = {
	type: 'FeatureCollection',
	features: [
		{
			type: 'Feature',
			geometry: { type: 'Point', coordinates: [-90.5, 35.5] },
			properties: { role: 'nearby', family: 'infrastructure', id: 'habitat-1' },
		},
		{
			type: 'Feature',
			geometry: { type: 'Point', coordinates: [-90.6, 35.6] },
			properties: { role: 'nearby', family: 'infrastructure', id: 'habitat-2' },
		},
	],
};

function useNearby(props: { readonly map: MapboxMap; readonly config: NearbyLayerConfig }): void {
	useNearbyLayer(props.map, true, props.config);
}

/** The ids the selection layer's `in` clause names. */
function selectedIdsOf(filter: unknown): unknown {
	const [, , membership] = filter as [string, unknown, [string, unknown, [string, unknown]]];
	return membership[2][1];
}

afterEach(cleanupRenderedHooks);

describe('useNearbyLayer', () => {
	it('rings every selected point after a basemap switch', () => {
		const fake = createFakeMap();
		renderHook(useNearby, {
			map: fake.map,
			config: { data: DATA, selectedIds: ['habitat-1', 'habitat-2'] },
		});

		expect(selectedIdsOf(fake.layers.get(SELECTED_LAYER_ID)?.filter)).toEqual([
			'habitat-1',
			'habitat-2',
		]);

		fake.wipeStyle();
		act(() => {
			fake.emit('style.load');
		});

		expect(selectedIdsOf(fake.layers.get(SELECTED_LAYER_ID)?.filter)).toEqual([
			'habitat-1',
			'habitat-2',
		]);
	});

	it('moves the ring when the selection changes', () => {
		const fake = createFakeMap();
		const harness = renderHook(useNearby, {
			map: fake.map,
			config: { data: DATA, selectedIds: ['habitat-1'] },
		});

		harness.rerender({ map: fake.map, config: { data: DATA, selectedIds: ['habitat-2'] } });

		expect(selectedIdsOf(fake.layers.get(SELECTED_LAYER_ID)?.filter)).toEqual(['habitat-2']);
	});
});
