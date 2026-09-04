// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import type { MapTileLayer } from '../../../../components/map';
import { tileLayerExtentUrl } from '../../../../components/map/tile-layers';
import { useTileLayer } from '../../../../components/map/use-tile-layer';
import { cleanupRenderedHooks, createFakeMap, type FakeMap, renderHook } from './fake-map';

afterEach(() => {
	cleanupRenderedHooks();
});

const SERVER = 'https://api.test';

function mount(fake: FakeMap, layer: MapTileLayer | undefined) {
	return renderHook(
		(props: { readonly layer: MapTileLayer | undefined }) =>
			useTileLayer(fake.map, true, props.layer),
		{ layer },
	);
}

describe('useTileLayer', () => {
	it('adds the tileset source and its layers, and takes them away on unmount', () => {
		const fake = createFakeMap();
		const handle = mount(fake, { kind: 'habitats', serverUrl: SERVER });

		expect(fake.sourceSpecs.get('habitats')).toMatchObject({
			type: 'vector',
			promoteId: 'id',
			tiles: ['https://api.test/map/tiles/habitats/{z}/{x}/{y}.mvt'],
		});
		expect(fake.layerIds()).toContain('habitats-polygon-fill');
		expect(fake.layerIds()).toContain('habitats-selected-point');

		handle.unmount();
		expect(fake.sources.has('habitats')).toBe(false);
		expect(fake.layerIds()).toEqual([]);
	});

	it('re-adds the source after a basemap switch wipes the style', () => {
		const fake = createFakeMap();
		mount(fake, { kind: 'traps', serverUrl: SERVER });

		fake.wipeStyle();
		expect(fake.sources.has('traps')).toBe(false);
		fake.emit('style.load');

		expect(fake.sources.has('traps')).toBe(true);
		expect(fake.layerIds()).toContain('traps-points');
	});

	// A filter change is a new tile URL, not a new source: re-adding the source
	// would drop every tile already fetched and blank the map for a beat.
	it('pushes a filter change onto the source it already added', () => {
		const fake = createFakeMap();
		const handle = mount(fake, { kind: 'habitats', serverUrl: SERVER });
		const before = fake.sourceSpecs.get('habitats');

		handle.rerender({
			layer: { kind: 'habitats', serverUrl: SERVER, filters: { isActive: true } },
		});

		expect(fake.sourceSpecs.get('habitats')).toBe(before);
		expect(fake.tilesOf('habitats')).toEqual([
			'https://api.test/map/tiles/habitats/{z}/{x}/{y}.mvt?isActive=true',
		]);
	});

	it('reports the clicked feature id, and null on empty map', () => {
		const fake = createFakeMap();
		const selected: (string | null)[] = [];
		mount(fake, { kind: 'samples', serverUrl: SERVER, onSelectFeature: (id) => selected.push(id) });

		fake.queryRenderedFeatures.mockReturnValueOnce([{ id: 'sample-1' }]);
		fake.click(-90, 35);
		fake.queryRenderedFeatures.mockReturnValueOnce([]);
		fake.click(-90, 35);

		expect(selected).toEqual(['sample-1', null]);
	});

	it('does nothing at all without a layer', () => {
		const fake = createFakeMap();
		mount(fake, undefined);

		expect(fake.sources.size).toBe(0);
		expect(fake.listenerCount('click')).toBe(0);
	});
});

describe('useTileLayer re-scoping', () => {
	it('re-filters the highlight layers when the selection changes', () => {
		const fake = createFakeMap();
		const handle = mount(fake, { kind: 'habitats', serverUrl: SERVER });

		handle.rerender({ layer: { kind: 'habitats', serverUrl: SERVER, selectedId: 'habitat-7' } });

		expect(JSON.stringify(fake.layers.get('habitats-selected-fill')?.filter)).toContain(
			'habitat-7',
		);
	});

	/*
	 * Regions stream whole and are hidden by a render-time filter on the *base*
	 * layers, which is why the re-scope effect reapplies every layer's filter
	 * rather than only the highlight ones. Ticking a checkbox has to reveal its
	 * region without refetching a tile.
	 */
	it('reveals a region by re-filtering, not by re-adding the source', () => {
		const fake = createFakeMap();
		const handle = mount(fake, { kind: 'regions', serverUrl: SERVER, visibleIds: ['region-a'] });
		const before = fake.sourceSpecs.get('regions');

		expect(JSON.stringify(fake.layers.get('regions-fill')?.filter)).toContain('region-a');

		handle.rerender({
			layer: { kind: 'regions', serverUrl: SERVER, visibleIds: ['region-a', 'region-b'] },
		});

		expect(fake.sourceSpecs.get('regions')).toBe(before);
		expect(JSON.stringify(fake.layers.get('regions-fill')?.filter)).toContain('region-b');
	});

	// The ticked set is a membership, so the same regions arriving in another
	// order is not a change and must not repaint four layers.
	it('ignores a reordering of the same visible regions', () => {
		const fake = createFakeMap();
		const handle = mount(fake, {
			kind: 'regions',
			serverUrl: SERVER,
			visibleIds: ['region-a', 'region-b'],
		});
		const calls = fake.filterCalls.length;

		handle.rerender({
			layer: { kind: 'regions', serverUrl: SERVER, visibleIds: ['region-b', 'region-a'] },
		});

		expect(fake.filterCalls.length).toBe(calls);
	});
});

describe('tileLayerExtentUrl', () => {
	it('frames the layer filters the tiles were built from', () => {
		expect(
			tileLayerExtentUrl({ kind: 'traps', serverUrl: SERVER, filters: { isActive: true } }),
		).toBe('https://api.test/map/tiles/traps/extent?status=active');
	});

	// Only the ticked regions are on screen, so an empty set has nothing to
	// frame and the camera is left where the reader put it.
	it('frames the ticked regions, and nothing when none are ticked', () => {
		expect(tileLayerExtentUrl({ kind: 'regions', serverUrl: SERVER })).toBeNull();
		expect(tileLayerExtentUrl({ kind: 'regions', serverUrl: SERVER, visibleIds: [] })).toBeNull();
		expect(tileLayerExtentUrl({ kind: 'regions', serverUrl: SERVER, visibleIds: ['b', 'a'] })).toBe(
			'https://api.test/map/tiles/regions/extent?id=a%2Cb',
		);
	});
});
