// @vitest-environment jsdom
/**
 * The route overlay's pointer and hover report.
 *
 * The cursor comes from the shared hover registry rather than a handler of the
 * route's own, so a second layer on a route map cannot wipe it in the same
 * event (#1426). The hovered stop is still reported out, which is how the list
 * beside the map highlights the same row.
 */
import type { Map as MapboxMap } from 'mapbox-gl';
import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerHoverLayers } from '../../../../components/map/hover-cursor';
import {
	type RouteLayerConfig,
	type RouteStopFeature,
	useRouteLayer,
} from '../../../../hooks/map/use-route-layer';
import { cleanupRenderedHooks, createFakeMap, renderHook } from '../../components/map/fake-map';

const STOPS: readonly RouteStopFeature[] = [
	{ id: 'stop-1', lng: -90.5, lat: 35.5, ordinal: 1, tone: 'default' },
	{ id: 'stop-2', lng: -90.6, lat: 35.6, ordinal: 2, tone: 'default' },
];

/** A hit on the first stop's pin, carrying the layer the registry sorts it by. */
const PIN_HIT = { layer: { id: 'route-sites-stop' }, properties: { id: 'stop-1' } };

function useRoute(props: { readonly map: MapboxMap; readonly config: RouteLayerConfig }): void {
	useRouteLayer(props.map, true, props.config);
}

afterEach(cleanupRenderedHooks);

describe('useRouteLayer', () => {
	it('shows the pointer over a stop through the shared registry and reports the hover', () => {
		const fake = createFakeMap();
		const onHoverStop = vi.fn();
		renderHook(useRoute, { map: fake.map, config: { stops: STOPS, onHoverStop } });

		fake.queryRenderedFeatures.mockReturnValue([PIN_HIT]);
		act(() => {
			fake.emit('mousemove', { point: { x: 1, y: 1 } });
		});
		expect(fake.canvas.style.cursor).toBe('pointer');
		expect(onHoverStop).toHaveBeenLastCalledWith('stop-1');

		fake.queryRenderedFeatures.mockReturnValue([]);
		act(() => {
			fake.emit('mousemove', { point: { x: 1, y: 1 } });
		});
		expect(fake.canvas.style.cursor).toBe('');
		expect(onHoverStop).toHaveBeenLastCalledWith(null);
	});

	// The registry runs one handler per map, so the route sharing it with another
	// overlay is what keeps a miss on that overlay from wiping the route's pointer.
	it('keeps the pointer over a stop when another registered layer misses', () => {
		const fake = createFakeMap();
		renderHook(useRoute, { map: fake.map, config: { stops: STOPS } });
		const release = registerHoverLayers(fake.map, () => ['other-layer']);

		fake.queryRenderedFeatures.mockImplementation(((
			_point: unknown,
			options: { layers: readonly string[] },
		) => (options.layers.includes('route-sites-stop') ? [PIN_HIT] : [])) as never);
		act(() => {
			fake.emit('mousemove', { point: { x: 1, y: 1 } });
		});

		expect(fake.canvas.style.cursor).toBe('pointer');
		release();
	});

	// The registry's hit-test is the only one: the route reads its hovered stop
	// off it rather than querying its own layers a second time.
	it('runs one hit-test per move on a map with only the route', () => {
		const fake = createFakeMap();
		const onHoverStop = vi.fn();
		renderHook(useRoute, { map: fake.map, config: { stops: STOPS, onHoverStop } });

		fake.queryRenderedFeatures.mockReturnValue([PIN_HIT]);
		act(() => {
			fake.emit('mousemove', { point: { x: 1, y: 1 } });
		});

		expect(fake.queryRenderedFeatures).toHaveBeenCalledTimes(1);
		expect(onHoverStop).toHaveBeenLastCalledWith('stop-1');
	});

	it('reports no hovered stop when the style has lost its layers', () => {
		const fake = createFakeMap();
		const onHoverStop = vi.fn();
		renderHook(useRoute, { map: fake.map, config: { stops: STOPS, onHoverStop } });

		for (const layerId of [
			'route-sites-stop',
			'route-sites-shape-fill',
			'route-sites-shape-line',
		]) {
			fake.map.removeLayer(layerId);
		}
		act(() => {
			fake.emit('mousemove', { point: { x: 1, y: 1 } });
		});

		expect(fake.queryRenderedFeatures).not.toHaveBeenCalled();
		expect(onHoverStop).toHaveBeenLastCalledWith(null);
	});

	it('probes the pins first, then the shape fill and line the style has', () => {
		const fake = createFakeMap();
		renderHook(useRoute, { map: fake.map, config: { stops: STOPS } });

		act(() => {
			fake.emit('mousemove', { point: { x: 1, y: 1 } });
		});

		expect(fake.queryRenderedFeatures).toHaveBeenCalledWith(expect.anything(), {
			layers: ['route-sites-stop', 'route-sites-shape-fill', 'route-sites-shape-line'],
		});
	});

	it('keeps the selection when a click misses every stop', () => {
		const fake = createFakeMap();
		const onSelectStop = vi.fn();
		renderHook(useRoute, { map: fake.map, config: { stops: STOPS, onSelectStop } });

		act(() => {
			fake.emit('click', { point: { x: 1, y: 1 } });
		});
		expect(onSelectStop).not.toHaveBeenCalled();

		fake.queryRenderedFeatures.mockReturnValue([{ properties: { id: 'stop-2' } }]);
		act(() => {
			fake.emit('click', { point: { x: 1, y: 1 } });
		});
		expect(onSelectStop).toHaveBeenCalledWith('stop-2');
	});

	it('takes its hover handler back off on unmount', () => {
		const fake = createFakeMap();
		const harness = renderHook(useRoute, { map: fake.map, config: { stops: STOPS } });

		harness.unmount();

		expect(fake.listenerCount('mousemove')).toBe(0);
		expect(fake.listenerCount('click')).toBe(0);
	});
});
