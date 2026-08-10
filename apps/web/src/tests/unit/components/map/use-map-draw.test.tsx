// @vitest-environment jsdom
import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DrawGeometry } from '../../../../components/map/use-map-draw';
import { useMapDraw } from '../../../../components/map/use-map-draw';
import type { FakeMap } from './fake-map';
import { cleanupRenderedHooks, createFakeMap, pressKey, renderHook } from './fake-map';

const SOURCE_ID = 'habitat-draw';
const LAYER_IDS = [
	'habitat-draw-fill',
	'habitat-draw-outline',
	'habitat-draw-line',
	'habitat-draw-vertex',
	'habitat-draw-point',
];

afterEach(cleanupRenderedHooks);

function mount(value: DrawGeometry | null = null) {
	const fake = createFakeMap();
	const onChange = vi.fn();
	const harness = renderHook(useMapDraw, {
		map: fake.map,
		isLoaded: true,
		value,
		onChange,
	});
	return { fake, onChange, ...harness };
}

/** Roles carried by the features the draft source is holding, in order. */
function roles(fake: FakeMap): (string | undefined)[] {
	return fake
		.featuresOf(SOURCE_ID)
		.map((feature) => feature.properties?.role ?? feature.geometry.type);
}

describe('useMapDraw', () => {
	it('adds the draft source and its layers in order', () => {
		const { fake } = mount();

		expect(fake.sources.has(SOURCE_ID)).toBe(true);
		expect([...fake.layers.keys()]).toEqual(LAYER_IDS);
	});

	it('waits for the map to report itself loaded', () => {
		const fake = createFakeMap();
		renderHook(useMapDraw, {
			map: fake.map,
			isLoaded: false,
			value: null,
			onChange: vi.fn(),
		});

		expect(fake.sources.size).toBe(0);
		expect(fake.layers.size).toBe(0);
	});

	it('renders a committed point as a point feature', () => {
		const { fake } = mount({ type: 'Point', coordinates: [-90.1, 35.1] });

		expect(roles(fake)).toEqual(['point']);
		expect(fake.featuresOf(SOURCE_ID)[0]?.geometry).toEqual({
			type: 'Point',
			coordinates: [-90.1, 35.1],
		});
	});

	it('renders a committed polygon as the shape plus its vertices', () => {
		const ring: readonly (readonly [number, number])[] = [
			[-90, 35],
			[-90, 36],
			[-89, 36],
			[-90, 35],
		];
		const { fake } = mount({ type: 'Polygon', coordinates: [ring] });

		expect(roles(fake)).toEqual(['Polygon', 'vertex', 'vertex', 'vertex']);
	});

	it('finishes a point on the first click', () => {
		const { fake, onChange, result } = mount();

		act(() => {
			result.current.start('Point');
		});
		expect(result.current.isDrawing).toBe(true);
		// Starting a draw clears whatever was committed before.
		expect(onChange).toHaveBeenCalledWith(null);

		act(() => {
			fake.click(-90.4, 35.4);
		});

		expect(onChange).toHaveBeenLastCalledWith({ type: 'Point', coordinates: [-90.4, 35.4] });
		expect(result.current.isDrawing).toBe(false);
	});

	it('collects vertices for a polygon and finishes into a closed ring', () => {
		const { fake, onChange, result } = mount();

		act(() => {
			result.current.start('Polygon');
		});
		act(() => {
			fake.click(-90, 35);
		});
		act(() => {
			fake.click(-90, 36);
		});
		act(() => {
			fake.click(-89, 36);
		});

		expect(result.current.vertexCount).toBe(3);
		expect(result.current.canFinish).toBe(true);
		// Three placed vertices already preview as the polygon they will become.
		expect(roles(fake)).toEqual(['Polygon', 'vertex', 'vertex', 'vertex']);

		act(() => {
			result.current.finish();
		});

		expect(onChange).toHaveBeenLastCalledWith({
			type: 'Polygon',
			coordinates: [
				[
					[-90, 35],
					[-90, 36],
					[-89, 36],
					[-90, 35],
				],
			],
		});
	});

	it('draws a rubber band to the cursor while a line is in progress', () => {
		const { fake, result } = mount();

		act(() => {
			result.current.start('LineString');
		});
		act(() => {
			fake.click(-90, 35);
		});
		act(() => {
			fake.move(-89, 36);
		});

		const [shape] = fake.featuresOf(SOURCE_ID);
		expect(shape?.geometry).toEqual({
			type: 'LineString',
			coordinates: [
				[-90, 35],
				[-89, 36],
			],
		});
	});

	it('drops the placed vertices on Escape', () => {
		const { fake, result } = mount();

		act(() => {
			result.current.start('Polygon');
		});
		act(() => {
			fake.click(-90, 35);
		});
		pressKey('Escape');

		expect(result.current.isDrawing).toBe(false);
		expect(result.current.vertexCount).toBe(0);
		expect(fake.featuresOf(SOURCE_ID)).toEqual([]);
	});

	it('undoes the last placed vertex', () => {
		const { fake, result } = mount();

		act(() => {
			result.current.start('Polygon');
		});
		act(() => {
			fake.click(-90, 35);
		});
		act(() => {
			fake.click(-90, 36);
		});
		act(() => {
			result.current.undo();
		});

		expect(result.current.vertexCount).toBe(1);
	});

	// The step a careless extraction breaks: a basemap switch wipes every custom
	// source and layer, and the in-progress shape has to come back with them.
	it('puts the source, layers, and the shape in progress back after a basemap switch', () => {
		const { fake, result } = mount();

		act(() => {
			result.current.start('Polygon');
		});
		act(() => {
			fake.click(-90, 35);
		});
		act(() => {
			fake.click(-90, 36);
		});

		fake.wipeStyle();
		expect(fake.sources.size).toBe(0);

		act(() => {
			fake.emit('style.load');
		});

		expect([...fake.layers.keys()]).toEqual(LAYER_IDS);
		expect(roles(fake)).toEqual(['LineString', 'vertex', 'vertex']);
	});

	// The rubber band lives in a ref, not in state, so a restyle has to repaint
	// from the refs — re-seeding the source from the last render would snap the
	// line back to the last placed vertex.
	it('keeps the rubber band pinned to the cursor across a basemap switch', () => {
		const { fake, result } = mount();

		act(() => {
			result.current.start('LineString');
		});
		act(() => {
			fake.click(-90, 35);
		});
		act(() => {
			fake.move(-89, 36);
		});

		fake.wipeStyle();
		act(() => {
			fake.emit('style.load');
		});

		expect(fake.featuresOf(SOURCE_ID)[0]?.geometry).toEqual({
			type: 'LineString',
			coordinates: [
				[-90, 35],
				[-89, 36],
			],
		});
	});

	it('puts a committed geometry back after a basemap switch', () => {
		const { fake } = mount({ type: 'Point', coordinates: [-90.1, 35.1] });

		fake.wipeStyle();
		act(() => {
			fake.emit('style.load');
		});

		expect([...fake.layers.keys()]).toEqual(LAYER_IDS);
		expect(roles(fake)).toEqual(['point']);
	});

	it('removes its layers and source on unmount', () => {
		const { fake, unmount } = mount({ type: 'Point', coordinates: [-90.1, 35.1] });

		unmount();

		expect(fake.layers.size).toBe(0);
		expect(fake.sources.size).toBe(0);
		expect(fake.listenerCount('style.load')).toBe(0);
	});

	// `useMapboxMap`'s cleanup calls `map.remove()` first on unmount, so the
	// teardown runs against a map that throws on every call.
	it('survives a map that was already removed', () => {
		const { fake, unmount } = mount();

		fake.remove();

		expect(() => {
			unmount();
		}).not.toThrow();
	});

	it('leaves the map alone until a draw actually starts', () => {
		const { fake } = mount();

		expect(fake.listenerCount('click')).toBe(0);
		expect(fake.canvas.style.cursor).toBe('');
		expect(fake.isDoubleClickZoomEnabled()).toBe(true);
	});

	it('restores the cursor and double-click zoom when the draw ends', () => {
		const { fake, result } = mount();

		act(() => {
			result.current.start('Polygon');
		});
		expect(fake.canvas.style.cursor).toBe('crosshair');
		expect(fake.isDoubleClickZoomEnabled()).toBe(false);

		act(() => {
			result.current.cancel();
		});

		expect(fake.canvas.style.cursor).toBe('');
		expect(fake.isDoubleClickZoomEnabled()).toBe(true);
		expect(fake.listenerCount('click')).toBe(0);
	});

	it('adopts a geometry obtained some other way', () => {
		const { onChange, result } = mount();

		act(() => {
			result.current.start('Polygon');
		});
		act(() => {
			result.current.commit({ type: 'Point', coordinates: [-90.9, 35.9] });
		});

		expect(onChange).toHaveBeenLastCalledWith({ type: 'Point', coordinates: [-90.9, 35.9] });
		expect(result.current.isDrawing).toBe(false);
	});

	it('resolves a requested point on the next click', async () => {
		const { fake, result } = mount();

		let pending: Promise<unknown> | null = null;
		act(() => {
			pending = result.current.requestPoint();
		});
		expect(result.current.isRequestingPoint).toBe(true);

		act(() => {
			fake.click(-90.7, 35.7);
		});

		await expect(pending).resolves.toEqual({ type: 'Point', coordinates: [-90.7, 35.7] });
		expect(result.current.isRequestingPoint).toBe(false);
	});
});
