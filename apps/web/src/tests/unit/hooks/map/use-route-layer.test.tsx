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

function useRoute(props: { readonly map: MapboxMap; readonly config: RouteLayerConfig }): void {
	useRouteLayer(props.map, true, props.config);
}

afterEach(cleanupRenderedHooks);

describe('useRouteLayer', () => {
	it('shows the pointer over a stop through the shared registry and reports the hover', () => {
		const fake = createFakeMap();
		const onHoverStop = vi.fn();
		renderHook(useRoute, { map: fake.map, config: { stops: STOPS, onHoverStop } });

		fake.queryRenderedFeatures.mockReturnValue([{ properties: { id: 'stop-1' } }]);
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
		) =>
			options.layers.includes('route-sites-stop')
				? [{ properties: { id: 'stop-1' } }]
				: []) as never);
		act(() => {
			fake.emit('mousemove', { point: { x: 1, y: 1 } });
		});

		expect(fake.canvas.style.cursor).toBe('pointer');
		release();
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
