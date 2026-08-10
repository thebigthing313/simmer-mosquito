// @vitest-environment jsdom
import type { LayerSpecification, Map as MapboxMap } from 'mapbox-gl';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useGeoJsonSource } from '../../../../components/map/use-geojson-source';

/**
 * Enough of a Mapbox map to hold sources and layers, and to replay the one
 * event that matters: `style.load`, which a basemap switch fires after wiping
 * every custom source and layer the map had.
 */
function createFakeMap() {
	const sources = new Map<string, { data: GeoJSON.GeoJSON }>();
	const sourceSpecs = new Map<string, Record<string, unknown>>();
	const layers = new Map<string, LayerSpecification>();
	const handlers = new Map<string, Set<(event: unknown) => void>>();
	const canvas = { style: { cursor: '' } };
	let removed = false;

	function assertLive() {
		if (removed) {
			throw new Error('Map has been removed.');
		}
	}

	const map = {
		getSource(id: string) {
			assertLive();
			const source = sources.get(id);
			return source === undefined
				? undefined
				: {
						setData(data: GeoJSON.GeoJSON) {
							source.data = data;
						},
					};
		},
		addSource(id: string, spec: { data: GeoJSON.GeoJSON }) {
			assertLive();
			sources.set(id, { data: spec.data });
			sourceSpecs.set(id, spec as Record<string, unknown>);
		},
		removeSource(id: string) {
			assertLive();
			sources.delete(id);
		},
		getLayer(id: string) {
			assertLive();
			return layers.get(id);
		},
		addLayer(layer: LayerSpecification) {
			assertLive();
			layers.set(layer.id, layer);
		},
		removeLayer(id: string) {
			assertLive();
			layers.delete(id);
		},
		getCanvas: () => canvas,
		queryRenderedFeatures: vi.fn(() => [] as unknown[]),
		on(event: string, handler: (event: unknown) => void) {
			const set = handlers.get(event) ?? new Set();
			set.add(handler);
			handlers.set(event, set);
		},
		off(event: string, handler: (event: unknown) => void) {
			handlers.get(event)?.delete(handler);
		},
	};

	return {
		map: map as unknown as MapboxMap,
		sources,
		sourceSpecs,
		layers,
		canvas,
		queryRenderedFeatures: map.queryRenderedFeatures,
		listenerCount: (event: string) => handlers.get(event)?.size ?? 0,
		emit(event: string, payload?: unknown) {
			for (const handler of [...(handlers.get(event) ?? [])]) {
				handler(payload);
			}
		},
		/** What a basemap switch does before it fires `style.load`. */
		wipeStyle() {
			sources.clear();
			layers.clear();
		},
		remove() {
			removed = true;
		},
	};
}

const POINT: GeoJSON.GeoJSON = { type: 'Point', coordinates: [-90.5, 35.5] };
const OTHER_POINT: GeoJSON.GeoJSON = { type: 'Point', coordinates: [-91.5, 36.5] };

function fillLayer(id: string, sourceId = 'test-source'): LayerSpecification {
	return { id, type: 'fill', source: sourceId, paint: {} } as LayerSpecification;
}

const containers: HTMLElement[] = [];

/** Mount a component that only calls the hook, and hand back a rerender/unmount pair. */
function renderHook(initial: Parameters<typeof useGeoJsonSource>[0]) {
	const container = document.createElement('div');
	containers.push(container);
	const root = createRoot(container);
	let props = initial;

	function Probe() {
		useGeoJsonSource(props);
		return null;
	}

	act(() => {
		root.render(<Probe />);
	});

	return {
		// Same element type and no key, so React updates in place. A changing key
		// would remount, re-run the setup effect, and quietly defeat the very
		// assertion this harness exists to make.
		rerender(next: Parameters<typeof useGeoJsonSource>[0]) {
			props = next;
			act(() => {
				root.render(<Probe />);
			});
		},
		unmount() {
			act(() => {
				root.unmount();
			});
		},
	};
}

afterEach(() => {
	for (const container of containers.splice(0)) {
		container.remove();
	}
});

describe('useGeoJsonSource', () => {
	it('adds the source and its layers in order', () => {
		const fake = createFakeMap();

		renderHook({
			map: fake.map,
			isLoaded: true,
			sourceId: 'test-source',
			data: POINT,
			layers: () => [fillLayer('under'), fillLayer('over')],
		});

		expect(fake.sources.get('test-source')?.data).toEqual(POINT);
		expect([...fake.layers.keys()]).toEqual(['under', 'over']);
	});

	it('does nothing at all while the data is null', () => {
		const fake = createFakeMap();

		renderHook({
			map: fake.map,
			isLoaded: true,
			sourceId: 'test-source',
			data: null,
			layers: () => [fillLayer('only')],
		});

		expect(fake.sources.size).toBe(0);
		expect(fake.layers.size).toBe(0);
	});

	it('waits for the map to report itself loaded', () => {
		const fake = createFakeMap();

		renderHook({
			map: fake.map,
			isLoaded: false,
			sourceId: 'test-source',
			data: POINT,
			layers: () => [fillLayer('only')],
		});

		expect(fake.sources.size).toBe(0);
	});

	// The step a careless extraction breaks. Nothing looks wrong until somebody
	// switches basemap, which wipes every custom source and layer.
	it('puts the source and layers back after a basemap switch', () => {
		const fake = createFakeMap();
		renderHook({
			map: fake.map,
			isLoaded: true,
			sourceId: 'test-source',
			data: POINT,
			layers: () => [fillLayer('only')],
		});

		fake.wipeStyle();
		expect(fake.sources.size).toBe(0);

		act(() => {
			fake.emit('style.load');
		});

		expect(fake.sources.get('test-source')?.data).toEqual(POINT);
		expect([...fake.layers.keys()]).toEqual(['only']);
	});

	it('pushes new data through setData rather than re-adding the layers', () => {
		const fake = createFakeMap();
		const layers = vi.fn(() => [fillLayer('only')]);
		const harness = renderHook({
			map: fake.map,
			isLoaded: true,
			sourceId: 'test-source',
			data: POINT,
			layers,
		});

		const addedDuringSetup = layers.mock.calls.length;

		harness.rerender({
			map: fake.map,
			isLoaded: true,
			sourceId: 'test-source',
			data: OTHER_POINT,
			layers,
		});

		expect(fake.sources.get('test-source')?.data).toEqual(OTHER_POINT);
		// The layer list is not consulted again: re-adding on every data tick is
		// what this hook exists to avoid.
		expect(layers.mock.calls.length).toBe(addedDuringSetup);
	});

	it('removes its layers and source on unmount', () => {
		const fake = createFakeMap();
		const harness = renderHook({
			map: fake.map,
			isLoaded: true,
			sourceId: 'test-source',
			data: POINT,
			layers: () => [fillLayer('a'), fillLayer('b')],
		});

		harness.unmount();

		expect(fake.layers.size).toBe(0);
		expect(fake.sources.size).toBe(0);
		expect(fake.listenerCount('style.load')).toBe(0);
	});

	// `useMapboxMap`'s cleanup calls `map.remove()` first on unmount, so the
	// teardown runs against a map that throws on every call.
	it('survives a map that was already removed', () => {
		const fake = createFakeMap();
		const harness = renderHook({
			map: fake.map,
			isLoaded: true,
			sourceId: 'test-source',
			data: POINT,
			layers: () => [fillLayer('only')],
		});

		fake.remove();

		expect(() => {
			harness.unmount();
		}).not.toThrow();
	});

	it('passes source options through when it creates the source', () => {
		const fake = createFakeMap();

		renderHook({
			map: fake.map,
			isLoaded: true,
			sourceId: 'test-source',
			data: POINT,
			layers: () => [fillLayer('only')],
			sourceOptions: { promoteId: 'id' },
		});

		expect(fake.sourceSpecs.get('test-source')).toMatchObject({ promoteId: 'id' });
	});

	// Feature-state goes the same way the layers do on a restyle, so whatever
	// holds it has to be re-applied every time, not just on first add.
	it('runs onEnsure on the first add and again after a basemap switch', () => {
		const fake = createFakeMap();
		const onEnsure = vi.fn();

		renderHook({
			map: fake.map,
			isLoaded: true,
			sourceId: 'test-source',
			data: POINT,
			layers: () => [fillLayer('only')],
			onEnsure,
		});

		expect(onEnsure).toHaveBeenCalledTimes(1);

		fake.wipeStyle();
		act(() => {
			fake.emit('style.load');
		});

		expect(onEnsure).toHaveBeenCalledTimes(2);
	});

	describe('interaction', () => {
		it('reports the clicked feature by its id property', () => {
			const fake = createFakeMap();
			const onSelectFeature = vi.fn();
			renderHook({
				map: fake.map,
				isLoaded: true,
				sourceId: 'test-source',
				data: POINT,
				layers: () => [fillLayer('hit')],
				interactive: { layerIds: ['hit'], onSelectFeature },
			});

			fake.queryRenderedFeatures.mockReturnValueOnce([{ properties: { id: 'habitat-1' } }]);
			act(() => {
				fake.emit('click', { point: { x: 1, y: 1 } });
			});

			expect(onSelectFeature).toHaveBeenCalledWith('habitat-1');
		});

		it('reports null when the click found nothing', () => {
			const fake = createFakeMap();
			const onSelectFeature = vi.fn();
			renderHook({
				map: fake.map,
				isLoaded: true,
				sourceId: 'test-source',
				data: POINT,
				layers: () => [fillLayer('hit')],
				interactive: { layerIds: ['hit'], onSelectFeature },
			});

			act(() => {
				fake.emit('click', { point: { x: 1, y: 1 } });
			});

			expect(onSelectFeature).toHaveBeenCalledWith(null);
		});

		it('only queries layers the style actually has', () => {
			const fake = createFakeMap();
			const onSelectFeature = vi.fn();
			renderHook({
				map: fake.map,
				isLoaded: true,
				sourceId: 'test-source',
				data: POINT,
				layers: () => [fillLayer('present')],
				interactive: { layerIds: ['present', 'never-added'], onSelectFeature },
			});

			act(() => {
				fake.emit('click', { point: { x: 1, y: 1 } });
			});

			expect(fake.queryRenderedFeatures).toHaveBeenCalledWith(expect.anything(), {
				layers: ['present'],
			});
		});

		it('shows a pointer only while over a feature', () => {
			const fake = createFakeMap();
			renderHook({
				map: fake.map,
				isLoaded: true,
				sourceId: 'test-source',
				data: POINT,
				layers: () => [fillLayer('hit')],
				interactive: { layerIds: ['hit'], onSelectFeature: vi.fn() },
			});

			fake.queryRenderedFeatures.mockReturnValueOnce([{ properties: { id: 'x' } }]);
			act(() => {
				fake.emit('mousemove', { point: { x: 1, y: 1 } });
			});
			expect(fake.canvas.style.cursor).toBe('pointer');

			act(() => {
				fake.emit('mousemove', { point: { x: 1, y: 1 } });
			});
			expect(fake.canvas.style.cursor).toBe('');
		});

		it('leaves the map handlers alone when nothing wants clicks', () => {
			const fake = createFakeMap();
			renderHook({
				map: fake.map,
				isLoaded: true,
				sourceId: 'test-source',
				data: POINT,
				layers: () => [fillLayer('only')],
			});

			expect(fake.listenerCount('click')).toBe(0);
			expect(fake.listenerCount('mousemove')).toBe(0);
		});
	});
});
