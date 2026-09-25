/** @vitest-environment jsdom */

/**
 * The `bbox` param a viewport-bound explorer sends, read off the map.
 *
 * Two things are worth holding here. The box comes from the canvas corners
 * rather than from `getBounds`, which subtracts the map's viewport padding: a
 * page with a results panel floating over its map sets that padding, so
 * `getBounds` hands back only the strip beside the panel and the list drops
 * every record behind it. And a view with a longitude outside the range, whether
 * wide enough to wrap the world or across the antimeridian, collapses to one
 * whole-world box rather than going out as a span no endpoint can read or
 * clamped to one side of the line (#933).
 *
 * The fake map unprojects linearly, a flat 0.001 degrees per pixel from the
 * origin, over a 1000x800 canvas. So the untouched viewport is west 0, south
 * -0.8, east 1, north 0, and its padded `getBounds` answer is the narrower
 * 0.2,-0.8,0.4,0 the first test names.
 */

import type { Map as MapboxMap } from 'mapbox-gl';
import { act } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import {
	RAIL_HOLDS_MOVE,
	useMapBoundsParam,
} from '../../../../hooks/explorer/use-map-bounds-param';
import {
	cleanupRenderedHooks,
	createFakeMap,
	type FakeMap,
	renderHook,
} from '../../components/map/fake-map';

afterEach(() => {
	cleanupRenderedHooks();
});

/**
 * Point the fake map's unprojection somewhere else.
 *
 * Everything this suite varies is what the four corners come back as, and the
 * fake map offers no seam for that, so the method is replaced in place. The map
 * object the hook holds is the same one, which is the point.
 */
function unprojectAs(fake: FakeMap, read: (pixel: readonly [number, number]) => LngLat): void {
	(fake.map as unknown as { unproject: (pixel: readonly [number, number]) => LngLat }).unproject =
		read;
}

interface LngLat {
	readonly lng: number;
	readonly lat: number;
}

/**
 * Fire a camera event the way mapbox does, inside an act boundary.
 *
 * The listener sets state, so without one React defers the update past the
 * assertion below it and warns besides.
 */
function settle(fake: FakeMap, event: 'moveend' | 'zoomend' | 'resize'): void {
	act(() => {
		fake.emit(event);
	});
}

describe('useMapBoundsParam', () => {
	it('has no box until it has a map', () => {
		const { result } = renderHook<MapboxMap | null, string | null>(useMapBoundsParam, null);

		expect(result.current).toBeNull();
	});

	it('reads the whole canvas rather than the padded bounds', () => {
		const fake = createFakeMap();

		const { result } = renderHook<MapboxMap | null, string | null>(useMapBoundsParam, fake.map);

		expect(result.current).toBe('0,-0.8,1,0');
		// What `getBounds` would have said, which is the panel-shaped strip.
		expect(result.current).not.toBe('0.2,-0.8,0.4,0');
	});

	it('unprojects all four corners, so a rotated view still fits in the box', () => {
		const fake = createFakeMap();
		// Under a bearing the visible region is not axis-aligned, and the extreme
		// longitudes sit on the other diagonal: the top-right and bottom-left
		// pixels here. Reading only the top-left and bottom-right corners would
		// answer 0,-0.8,0.2,0 and drop most of the view.
		unprojectAs(fake, ([x, y]) => ({ lng: (x - y) * 0.001, lat: -y * 0.001 }));

		const { result } = renderHook<MapboxMap | null, string | null>(useMapBoundsParam, fake.map);

		expect(result.current).toBe('-0.8,-0.8,1,0');
	});

	it('collapses a world-spanning view to one whole-world box', () => {
		const fake = createFakeMap();
		// Zoomed far enough out that mapbox unprojects past the antimeridian in
		// both directions. The raw span is 500 degrees, which is not a box any
		// endpoint can read.
		unprojectAs(fake, ([x, y]) => ({ lng: -250 + x * 0.5, lat: -y * 0.001 }));

		const { result } = renderHook<MapboxMap | null, string | null>(useMapBoundsParam, fake.map);

		expect(result.current).toBe('-180,-0.8,180,0');
	});

	it('collapses a view across the antimeridian to the whole world, not to one side of it', () => {
		const fake = createFakeMap();
		// Mapbox unprojects a camera past the line unwrapped, so a view centred on
		// it reads west 170, east 190. Clamping that to 170,180 would drop the
		// eastern half of what the reader is looking at, with nothing on screen
		// to say so; the whole world is a superset, which is wrong in the
		// direction a person can see (#933).
		unprojectAs(fake, ([x, y]) => ({ lng: 170 + x * 0.02, lat: -y * 0.001 }));

		const { result } = renderHook<MapboxMap | null, string | null>(useMapBoundsParam, fake.map);

		expect(result.current).toBe('-180,-0.8,180,0');
	});

	it('sends a view inside the longitude range as it is', () => {
		const fake = createFakeMap();
		unprojectAs(fake, ([x, y]) => ({ lng: -170 + x * 0.1, lat: -y * 0.001 }));

		const { result } = renderHook<MapboxMap | null, string | null>(useMapBoundsParam, fake.map);

		expect(result.current).toBe('-170,-0.8,-70,0');
	});

	it('sends a view that is exactly the whole world as it is', () => {
		const fake = createFakeMap();
		// The endpoints of the range are in it, so a 360 degree span sitting
		// exactly on them is a box the endpoint reads, and collapsing it would
		// answer the same string anyway.
		unprojectAs(fake, ([x, y]) => ({ lng: -180 + x * 0.36, lat: -y * 0.001 }));

		const { result } = renderHook<MapboxMap | null, string | null>(useMapBoundsParam, fake.map);

		expect(result.current).toBe('-180,-0.8,180,0');
	});

	it('clamps a view that runs past the poles', () => {
		const fake = createFakeMap();
		unprojectAs(fake, ([x, y]) => ({ lng: x * 0.001, lat: 95 - y * 0.25 }));

		const { result } = renderHook<MapboxMap | null, string | null>(useMapBoundsParam, fake.map);

		expect(result.current).toBe('0,-90,1,90');
	});

	it('re-reads the box when the camera settles, and keeps it when it has not moved', () => {
		const fake = createFakeMap();
		const { result } = renderHook<MapboxMap | null, string | null>(useMapBoundsParam, fake.map);
		const first = result.current;

		// Same viewport, so the same string: an equivalent view must not key a
		// second request.
		settle(fake, 'moveend');
		expect(result.current).toBe(first);

		unprojectAs(fake, ([x, y]) => ({ lng: 10 + x * 0.001, lat: -y * 0.001 }));
		settle(fake, 'zoomend');
		expect(result.current).toBe('10,-0.8,11,0');

		unprojectAs(fake, ([x, y]) => ({ lng: 20 + x * 0.001, lat: -y * 0.001 }));
		settle(fake, 'resize');
		expect(result.current).toBe('20,-0.8,21,0');
	});

	// A flight to a record picked from a rail that keeps its rows carries the
	// flag, and the box stays on the viewport the rail was read under. The next
	// move without it, a pan the reader makes, is read as usual.
	it('keeps the box through a move marked as held for the rail', () => {
		const fake = createFakeMap();
		const { result } = renderHook<MapboxMap | null, string | null>(useMapBoundsParam, fake.map);
		const first = result.current;

		unprojectAs(fake, ([x, y]) => ({ lng: 10 + x * 0.001, lat: -y * 0.001 }));
		act(() => {
			fake.emit('moveend', { [RAIL_HOLDS_MOVE]: true });
			fake.emit('zoomend', { [RAIL_HOLDS_MOVE]: true });
		});
		expect(result.current).toBe(first);

		settle(fake, 'moveend');
		expect(result.current).toBe('10,-0.8,11,0');
	});

	it('takes its camera listeners back off the map', () => {
		const fake = createFakeMap();
		const { unmount } = renderHook<MapboxMap | null, string | null>(useMapBoundsParam, fake.map);

		expect(fake.listenerCount('moveend')).toBe(1);
		expect(fake.listenerCount('zoomend')).toBe(1);
		expect(fake.listenerCount('resize')).toBe(1);

		unmount();

		expect(fake.listenerCount('moveend')).toBe(0);
		expect(fake.listenerCount('zoomend')).toBe(0);
		expect(fake.listenerCount('resize')).toBe(0);
	});

	it('forgets the box when the map goes away', () => {
		const fake = createFakeMap();
		const { result, rerender } = renderHook<MapboxMap | null, string | null>(
			useMapBoundsParam,
			fake.map,
		);
		expect(result.current).toBe('0,-0.8,1,0');

		rerender(null);

		expect(result.current).toBeNull();
	});
});
