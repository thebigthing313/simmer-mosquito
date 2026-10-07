// @vitest-environment jsdom
import { MAP_CLUSTER_UNTIL_ZOOM } from '@simmer-mosquito/mapping';
import { afterEach, describe, expect, it } from 'vitest';
import type { MapTileLayer } from '../../../../components/map';
import { useSelectionOverlayLayer } from '../../../../hooks/map/use-selection-overlay-layer';
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
const TRAP_ID = 'trap-7';
const point = { type: 'Point', coordinates: [-74.45, 40.35] } as const;

/** Both hooks in the order `TileLayerMount` calls them. */
function mount(fake: FakeMap, layer: MapTileLayer, cluster = true) {
	return renderHook(
		(props: { readonly layer: MapTileLayer; readonly cluster: boolean }) => {
			const draw = { cluster: props.cluster };
			useTileLayer(fake.map, true, props.layer, draw);
			useSelectionOverlayLayer(fake.map, true, props.layer, draw);
		},
		{ layer, cluster },
	);
}

function trapLayer(selected: boolean, onSelectFeature?: (id: string | null) => void): MapTileLayer {
	return {
		kind: 'traps',
		serverUrl: SERVER,
		selectedId: selected ? TRAP_ID : null,
		selectedRecord: selected ? { id: TRAP_ID, geojson: point } : null,
		...(onSelectFeature === undefined ? {} : { onSelectFeature }),
	};
}

describe('the selection overlay on a clustered tileset', () => {
	it('draws the selected trap above the cluster layers, and clears with the selection', () => {
		const fake = createFakeMap();
		const handle = mount(fake, trapLayer(false));

		expect(fake.sources.has('traps-selection')).toBe(false);

		handle.rerender({ layer: trapLayer(true), cluster: true });

		expect(fake.sources.get('traps-selection')?.data).toBe(point);
		const ids = fake.layerIds();
		expect(ids.indexOf('traps-selection-point')).toBeGreaterThan(ids.indexOf('traps-clusters'));
		expect(ids.indexOf('traps-selection-point')).toBeGreaterThan(
			ids.indexOf('traps-cluster-counts'),
		);
		expect(fake.layers.get('traps-selection-point')).toMatchObject({
			maxzoom: MAP_CLUSTER_UNTIL_ZOOM,
		});

		handle.rerender({ layer: trapLayer(false), cluster: true });

		expect(fake.sources.has('traps-selection')).toBe(false);
		expect(fake.layerIds()).not.toContain('traps-selection-point');
	});

	// One selected point at every zoom: the overlay below the cut-off, the tile's
	// own highlight from it up.
	it('hands the zooms below the cut-off from the tile highlight to the overlay and back', () => {
		const fake = createFakeMap();
		const handle = mount(fake, trapLayer(false));

		expect(fake.layers.get('traps-selected-point')?.minzoom ?? 0).toBe(0);

		handle.rerender({ layer: trapLayer(true), cluster: true });
		expect(fake.layers.get('traps-selected-point')?.minzoom).toBe(MAP_CLUSTER_UNTIL_ZOOM);

		handle.rerender({ layer: trapLayer(false), cluster: true });
		expect(fake.layers.get('traps-selected-point')?.minzoom).toBe(0);
	});

	it('keeps the tile URL when a trap is selected', () => {
		const fake = createFakeMap();
		const handle = mount(fake, trapLayer(false));
		const before = fake.tilesOf('traps');

		handle.rerender({ layer: trapLayer(true), cluster: true });

		expect(fake.tilesOf('traps')).toEqual(before);
	});

	// The overlay sits over the cluster that holds the record, and a click on a
	// cluster zooms in. A click on the overlay is a click on the record instead.
	it('selects the record on a click on the overlay, and does not zoom to the cluster', () => {
		const fake = createFakeMap();
		const selected: (string | null)[] = [];
		mount(
			fake,
			trapLayer(true, (id) => selected.push(id)),
		);

		fake.queryRenderedFeatures.mockReturnValueOnce([
			{ layer: { id: 'traps-selection-point' }, properties: {} },
		]);
		fake.click(-74.45, 40.35);

		expect(selected).toEqual([TRAP_ID]);
		expect(fake.cameraCalls).toEqual([]);
		expect(fake.queryRenderedFeatures).toHaveBeenLastCalledWith(
			expect.anything(),
			expect.objectContaining({
				layers: expect.arrayContaining(['traps-selection-point', 'traps-clusters']),
			}),
		);
	});

	it('draws no overlay over a tileset whose tiles are not clustered', () => {
		const fake = createFakeMap();
		mount(fake, {
			kind: 'habitats',
			serverUrl: SERVER,
			selectedId: TRAP_ID,
			selectedRecord: { id: TRAP_ID, geojson: point },
		});

		expect(fake.sources.has('habitats-selection')).toBe(false);
		expect(fake.layers.get('habitats-selected-point')?.minzoom ?? 0).toBe(0);
	});

	// Switching clustering off is a new tile URL and plain tiles, so the tile's
	// highlight takes every zoom back and the overlay comes off.
	it('takes the overlay off when clustering is switched off', () => {
		const fake = createFakeMap();
		const handle = mount(fake, trapLayer(true));

		expect(fake.sources.has('traps-selection')).toBe(true);

		handle.rerender({ layer: trapLayer(true), cluster: false });

		expect(fake.tilesOf('traps')?.[0]).not.toContain('cluster=1');
		expect(fake.sources.has('traps-selection')).toBe(false);
		expect(fake.layers.get('traps-selected-point')?.minzoom).toBe(0);
	});
});
