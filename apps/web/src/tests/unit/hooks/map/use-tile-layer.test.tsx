// @vitest-environment jsdom
import { MAP_CLUSTER_UNTIL_ZOOM } from '@simmer-mosquito/mapping';
import { afterEach, describe, expect, it } from 'vitest';
import type { MapTileLayer } from '../../../../components/map';
import { tileLayerExtentUrl } from '../../../../components/map/tile-layers';
import { useTileLayer } from '../../../../hooks/map/use-tile-layer';
import {
	cleanupRenderedHooks,
	createFakeMap,
	type FakeMap,
	renderHook,
} from '../../components/map/fake-map';

afterEach(() => {
	cleanupRenderedHooks();
});

const SERVER = 'https://api.test';

interface MountProps {
	readonly layer: MapTileLayer | undefined;
	/** The clustering setting; a rerender that leaves it out keeps the mounted one. */
	readonly cluster?: boolean;
}

function mount(fake: FakeMap, layer: MapTileLayer | undefined, cluster = false) {
	return renderHook<MountProps, void>(
		(props) => useTileLayer(fake.map, true, props.layer, { cluster: props.cluster ?? cluster }),
		{ layer, cluster },
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

	// A cluster is no record: a click on one zooms to the records under it and
	// leaves the selection alone, never closer than the zoom clustering stops at.
	it('zooms to a clicked cluster without selecting anything', () => {
		const fake = createFakeMap();
		const selected: (string | null)[] = [];
		mount(fake, { kind: 'traps', serverUrl: SERVER, onSelectFeature: (id) => selected.push(id) });

		fake.queryRenderedFeatures.mockReturnValueOnce([
			{
				properties: {
					cluster: true,
					point_count: 3,
					cluster_west: -74.5,
					cluster_south: 40.3,
					cluster_east: -74.4,
					cluster_north: 40.4,
				},
			},
		]);
		fake.click(-74.45, 40.35);

		expect(selected).toEqual([]);
		expect(fake.cameraCalls).toEqual([expect.objectContaining({ kind: 'fitBounds', padding: 48 })]);
	});

	it('centres on a cluster whose points share one spot, at the zoom clustering stops', () => {
		const fake = createFakeMap();
		mount(fake, { kind: 'traps', serverUrl: SERVER, onSelectFeature: () => {} });

		fake.queryRenderedFeatures.mockReturnValueOnce([
			{
				properties: {
					cluster: true,
					point_count: 2,
					cluster_west: -74.4,
					cluster_south: 40.3,
					cluster_east: -74.4,
					cluster_north: 40.3,
				},
			},
		]);
		fake.click(-74.4, 40.3);

		expect(fake.cameraCalls).toEqual([
			expect.objectContaining({ kind: 'easeTo', zoom: MAP_CLUSTER_UNTIL_ZOOM }),
		]);
	});

	it('asks the trap tiles for clusters when clustering is on', () => {
		const fake = createFakeMap();
		mount(fake, { kind: 'traps', serverUrl: SERVER }, true);

		expect(fake.tilesOf('traps')).toEqual([
			'https://api.test/map/tiles/traps/{z}/{x}/{y}.mvt?cluster=1',
		]);
		expect(fake.layerIds()).toEqual(
			expect.arrayContaining(['traps-clusters', 'traps-cluster-counts']),
		);
	});

	// Switching is a new tile URL on the source already there, the way a filter
	// change is: no camera move, and the highlight keeps the selected record.
	it('swaps the tiles in place when clustering is switched', () => {
		const fake = createFakeMap();
		const layer: MapTileLayer = { kind: 'traps', serverUrl: SERVER, selectedId: 'trap-1' };
		const handle = mount(fake, layer, true);
		const before = fake.sourceSpecs.get('traps');

		handle.rerender({ layer, cluster: false });
		expect(fake.sourceSpecs.get('traps')).toBe(before);
		expect(fake.tilesOf('traps')).toEqual(['https://api.test/map/tiles/traps/{z}/{x}/{y}.mvt']);

		handle.rerender({ layer, cluster: true });
		expect(fake.tilesOf('traps')).toEqual([
			'https://api.test/map/tiles/traps/{z}/{x}/{y}.mvt?cluster=1',
		]);
		expect(fake.cameraCalls).toEqual([]);
		expect(JSON.stringify(fake.layers.get('traps-selected-point')?.filter)).toContain('trap-1');
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
