/**
 * One hover handler per map, asking for every registered layer at once.
 *
 * Each layer hook used to set the cursor from its own `mousemove`, so the last
 * one to run decided it: a feature under the first layer drew the pointer and
 * a miss on the second wiped it in the same event. These cases hold the shared
 * handler to one hit-test per event and to the union of the layers.
 */

import type { Map as MapboxMap, MapMouseEvent } from 'mapbox-gl';
import { describe, expect, it, vi } from 'vitest';
import { registerHoverLayers } from '../../../../components/map/hover-cursor';

function fakeMap(hitLayers: readonly string[]) {
	const handlers = new Set<(event: MapMouseEvent) => void>();
	const canvas = { style: { cursor: '' } };
	const queryRenderedFeatures = vi.fn(
		(_point: unknown, options: { layers: readonly string[] }) =>
			options.layers.filter((layer) => hitLayers.includes(layer)).map((layer) => ({ layer })),
	);
	const map = {
		on: (_type: string, handler: (event: MapMouseEvent) => void) => handlers.add(handler),
		off: (_type: string, handler: (event: MapMouseEvent) => void) => handlers.delete(handler),
		getCanvas: () => canvas,
		queryRenderedFeatures,
	} as unknown as MapboxMap;
	const move = () => {
		for (const handler of handlers) {
			handler({ point: { x: 1, y: 1 } } as MapMouseEvent);
		}
	};
	return { map, canvas, handlers, queryRenderedFeatures, move };
}

describe('registerHoverLayers', () => {
	it('draws the pointer over the first layer when a later layer misses', () => {
		const { map, canvas, move } = fakeMap(['habitats']);
		registerHoverLayers(map, () => ['habitats']);
		registerHoverLayers(map, () => ['traps']);

		move();

		expect(canvas.style.cursor).toBe('pointer');
	});

	it('runs one hit-test per event however many layers are registered', () => {
		const { map, queryRenderedFeatures, move } = fakeMap([]);
		registerHoverLayers(map, () => ['habitats']);
		registerHoverLayers(map, () => ['traps', 'samples']);

		move();

		expect(queryRenderedFeatures).toHaveBeenCalledTimes(1);
		expect(queryRenderedFeatures.mock.calls[0]?.[1].layers).toEqual([
			'habitats',
			'traps',
			'samples',
		]);
	});

	it('takes the handler off the map once the last layer is released', () => {
		const { map, handlers } = fakeMap([]);
		const releaseHabitats = registerHoverLayers(map, () => ['habitats']);
		const releaseTraps = registerHoverLayers(map, () => ['traps']);

		expect(handlers.size).toBe(1);
		releaseHabitats();
		expect(handlers.size).toBe(1);
		releaseTraps();
		expect(handlers.size).toBe(0);
	});

	it('leaves the cursor alone when no registered layer is on the map', () => {
		const { map, canvas, queryRenderedFeatures, move } = fakeMap([]);
		canvas.style.cursor = 'crosshair';
		registerHoverLayers(map, () => []);

		move();

		expect(queryRenderedFeatures).not.toHaveBeenCalled();
		expect(canvas.style.cursor).toBe('crosshair');
	});
});
