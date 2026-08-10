// @vitest-environment jsdom
import type { LayerSpecification } from 'mapbox-gl';
import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useGeoJsonSource } from '../../../../components/map/use-geojson-source';
import { cleanupRenderedHooks, createFakeMap, renderHook } from './fake-map';

const POINT: GeoJSON.GeoJSON = { type: 'Point', coordinates: [-90.5, 35.5] };
const OTHER_POINT: GeoJSON.GeoJSON = { type: 'Point', coordinates: [-91.5, 36.5] };

function fillLayer(id: string, sourceId = 'test-source'): LayerSpecification {
	return { id, type: 'fill', source: sourceId, paint: {} } as LayerSpecification;
}

afterEach(cleanupRenderedHooks);

describe('useGeoJsonSource', () => {
	it('adds the source and its layers in order', () => {
		const fake = createFakeMap();

		renderHook(useGeoJsonSource, {
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

		renderHook(useGeoJsonSource, {
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

		renderHook(useGeoJsonSource, {
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
		renderHook(useGeoJsonSource, {
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
		const harness = renderHook(useGeoJsonSource, {
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
		const harness = renderHook(useGeoJsonSource, {
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
		const harness = renderHook(useGeoJsonSource, {
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

		renderHook(useGeoJsonSource, {
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

		renderHook(useGeoJsonSource, {
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
			renderHook(useGeoJsonSource, {
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
			renderHook(useGeoJsonSource, {
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
			renderHook(useGeoJsonSource, {
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
			renderHook(useGeoJsonSource, {
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
			renderHook(useGeoJsonSource, {
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
