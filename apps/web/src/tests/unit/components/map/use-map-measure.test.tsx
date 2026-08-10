// @vitest-environment jsdom
import { act } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { useMapMeasure } from '../../../../components/map/use-map-measure';
import type { FakeMap } from './fake-map';
import { cleanupRenderedHooks, createFakeMap, pressKey, renderHook } from './fake-map';

const SOURCE_ID = 'map-measure';
const LAYER_IDS = [
	'map-measure-fill',
	'map-measure-outline',
	'map-measure-line',
	'map-measure-vertex',
];

afterEach(cleanupRenderedHooks);

function mount() {
	const fake = createFakeMap();
	const harness = renderHook(useMapMeasure, { map: fake.map, isLoaded: true });
	return { fake, ...harness };
}

/** Roles carried by the features the measure source is holding, in order. */
function roles(fake: FakeMap): (string | undefined)[] {
	return fake.featuresOf(SOURCE_ID).map((feature) => feature.properties?.role);
}

/** The outer ring of a polygon feature, for asserting how far a shape reaches. */
function cornersOf(feature: GeoJSON.Feature | undefined): GeoJSON.Position[] {
	return feature?.geometry.type === 'Polygon' ? (feature.geometry.coordinates[0] ?? []) : [];
}

describe('useMapMeasure', () => {
	it('adds the measure source and its layers in order', () => {
		const { fake } = mount();

		expect(fake.sources.has(SOURCE_ID)).toBe(true);
		expect([...fake.layers.keys()]).toEqual(LAYER_IDS);
	});

	it('waits for the map to report itself loaded', () => {
		const fake = createFakeMap();
		renderHook(useMapMeasure, { map: fake.map, isLoaded: false });

		expect(fake.sources.size).toBe(0);
		expect(fake.layers.size).toBe(0);
	});

	it('measures a line across two clicks', () => {
		const { fake, result } = mount();

		act(() => {
			result.current.selectTool('distance');
		});
		act(() => {
			fake.click(-90, 35);
		});
		act(() => {
			fake.click(-90, 36);
		});

		expect(result.current.draftPointCount).toBe(2);

		act(() => {
			result.current.finish();
		});

		expect(result.current.measurements).toHaveLength(1);
		const [measurement] = result.current.measurements;
		expect(measurement?.tool).toBe('distance');
		// One degree of latitude, near enough.
		expect(measurement?.lengthMeters).toBeGreaterThan(110_000);
		expect(measurement?.areaMeters).toBe(0);
		expect(roles(fake)).toEqual(['shape']);
	});

	it('closes a rectangle on the second click and reports its area', () => {
		const { fake, result } = mount();

		act(() => {
			result.current.selectTool('rectangle');
		});
		act(() => {
			fake.click(-90, 35);
		});
		act(() => {
			fake.click(-89, 36);
		});

		expect(result.current.measurements).toHaveLength(1);
		expect(result.current.measurements[0]?.areaMeters).toBeGreaterThan(0);
		expect(result.current.measurements[0]?.radiusMeters).toBeNull();
	});

	it('measures a circle by its radius', () => {
		const { fake, result } = mount();

		act(() => {
			result.current.selectTool('circle');
		});
		// The first click anchors the centre; the second sets the radius.
		act(() => {
			fake.click(-90, 35);
		});
		act(() => {
			fake.click(-90, 36);
		});

		expect(result.current.measurements).toHaveLength(1);
		expect(result.current.measurements[0]?.radiusMeters).toBeGreaterThan(110_000);
		expect(result.current.measurements[0]?.areaMeters).toBeGreaterThan(0);
	});

	it('previews the shape in progress before it is committed', () => {
		const { fake, result } = mount();

		act(() => {
			result.current.selectTool('distance');
		});
		act(() => {
			fake.click(-90, 35);
		});
		act(() => {
			fake.move(-90, 36);
		});

		// The rubber-band line plus the one placed point. The preview is painted
		// straight onto the source from refs, without a React render — that is what
		// keeps a mousemove from re-rendering the whole panel per frame.
		expect(roles(fake)).toEqual(['draft', 'vertex']);
		const [line] = fake.featuresOf(SOURCE_ID);
		expect(line?.geometry).toEqual({
			type: 'LineString',
			coordinates: [
				[-90, 35],
				[-90, 36],
			],
		});
	});

	it('drops the shape in progress on Escape and keeps the finished ones', () => {
		const { fake, result } = mount();

		act(() => {
			result.current.selectTool('rectangle');
		});
		act(() => {
			fake.click(-90, 35);
		});
		act(() => {
			fake.click(-89, 36);
		});
		act(() => {
			result.current.selectTool('distance');
		});
		act(() => {
			fake.click(-91, 34);
		});
		pressKey('Escape');

		expect(result.current.measurements).toHaveLength(1);
		expect(roles(fake)).toEqual(['shape']);
	});

	it('clears every shape and leaves measurement mode', () => {
		const { fake, result } = mount();

		act(() => {
			result.current.selectTool('rectangle');
		});
		act(() => {
			fake.click(-90, 35);
		});
		act(() => {
			fake.click(-89, 36);
		});
		act(() => {
			result.current.clear();
		});

		expect(result.current.isMeasuring).toBe(false);
		expect(result.current.measurements).toEqual([]);
		expect(fake.featuresOf(SOURCE_ID)).toEqual([]);
	});

	// The step a careless extraction breaks: a basemap switch wipes every custom
	// source and layer, and the shapes measured so far have to come back too.
	it('puts the source, layers, and measured shapes back after a basemap switch', () => {
		const { fake, result } = mount();

		act(() => {
			result.current.selectTool('rectangle');
		});
		act(() => {
			fake.click(-90, 35);
		});
		act(() => {
			fake.click(-89, 36);
		});

		fake.wipeStyle();
		expect(fake.sources.size).toBe(0);

		act(() => {
			fake.emit('style.load');
		});

		expect([...fake.layers.keys()]).toEqual(LAYER_IDS);
		expect(roles(fake)).toEqual(['shape']);
	});

	// The shape being dragged out lives in a ref, not in state, so a restyle has
	// to repaint from the refs or the half-drawn rectangle disappears until the
	// next click.
	it('keeps the shape being dragged out across a basemap switch', () => {
		const { fake, result } = mount();

		act(() => {
			result.current.selectTool('rectangle');
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

		expect(roles(fake)).toEqual(['draft', 'vertex']);
		// The rectangle has to still reach the cursor. Re-seeding from the last
		// render would collapse it onto its anchor, where the cursor was when the
		// anchoring click rendered.
		expect(cornersOf(fake.featuresOf(SOURCE_ID)[0])).toContainEqual([-89, 36]);
	});

	it('removes its layers and source on unmount', () => {
		const { fake, unmount } = mount();

		unmount();

		expect(fake.layers.size).toBe(0);
		expect(fake.sources.size).toBe(0);
		expect(fake.listenerCount('style.load')).toBe(0);
	});

	it('survives a map that was already removed', () => {
		const { fake, unmount } = mount();

		fake.remove();

		expect(() => {
			unmount();
		}).not.toThrow();
	});

	it('leaves the map alone until a tool is picked', () => {
		const { fake } = mount();

		expect(fake.listenerCount('click')).toBe(0);
		expect(fake.canvas.style.cursor).toBe('');
		expect(fake.isDoubleClickZoomEnabled()).toBe(true);
	});

	it('restores the cursor and double-click zoom when measurement ends', () => {
		const { fake, result } = mount();

		act(() => {
			result.current.selectTool('distance');
		});
		expect(fake.canvas.style.cursor).toBe('crosshair');
		expect(fake.isDoubleClickZoomEnabled()).toBe(false);

		act(() => {
			result.current.clear();
		});

		expect(fake.canvas.style.cursor).toBe('');
		expect(fake.isDoubleClickZoomEnabled()).toBe(true);
		expect(fake.listenerCount('click')).toBe(0);
	});
});
