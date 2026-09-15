/**
 * What a suite rendering a whole explorer route fakes, shared between the
 * routes that do it.
 *
 * `traps-empty-state.test.tsx` wrote these out first and
 * `addresses-viewport.test.tsx` was about to be a second copy of sixty-eight
 * lines, with the service-request conversion (#963) queued to be a third.
 * `vi.mock` is hoisted per file and has to stay in the suite, but what the
 * factory hands back does not: the canvas stand-in, the role ladder and the
 * layout stubs are ordinary modules a factory can `import()`.
 */

import type { Map as MapboxMap } from 'mapbox-gl';
import { useEffect } from 'react';
import type { MapTileLayer } from '../../../components/map/tile-layers';
import { tileLayerExtentUrl } from '../../../components/map/tile-layers';
import { useMapExtent } from '../../../components/map/use-map-extent-fit';
import type { MinimumRole } from '../../../lib/write-access';
import { createFakeMap } from '../components/map/fake-map';

/**
 * The canvas, reduced to the two things the rail depends on it for: a map to
 * read a viewport off, and the extent request `fitToData` sends. The real one
 * observes the same query through `useMapExtentFit`, and so does this, which is
 * what lets a request count say whether the rail added one.
 */
export function MapCanvasStandIn({
	fitToData,
	layers,
	onMapReady,
}: {
	readonly fitToData?: boolean;
	readonly layers?: readonly MapTileLayer[];
	readonly onMapReady?: (map: MapboxMap) => void;
}) {
	const first = layers?.[0];
	useMapExtent(fitToData === true && first !== undefined ? tileLayerExtentUrl(first) : null);
	useEffect(() => {
		onMapReady?.(createFakeMap().map);
	}, [onMapReady]);
	return <p>map surface</p>;
}

const RANK: Record<string, number | undefined> = {
	viewer: 0,
	collector: 1,
	manager: 2,
	admin: 3,
	owner: 4,
};

/** Whether the signed-in role reaches a control's floor, for a `useHasRole` stand-in. */
export function roleReaches(role: string, minimum: MinimumRole): boolean {
	return (RANK[role] ?? 0) >= (RANK[minimum] ?? 0);
}

/**
 * The panel measures the stage and its own box, and jsdom lays nothing out.
 * Every element reports one size.
 */
export function stubPanelLayout(): void {
	Object.defineProperty(globalThis, 'ResizeObserver', {
		configurable: true,
		writable: true,
		value: class {
			private readonly callback: (entries: readonly unknown[]) => void;
			constructor(callback: (entries: readonly unknown[]) => void) {
				this.callback = callback;
			}
			observe(target: Element) {
				this.callback([{ contentRect: { width: 1000, height: 700 }, target }]);
			}
			unobserve() {}
			disconnect() {}
		},
	});
	Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
		configurable: true,
		get: () => 700,
	});
	Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
		configurable: true,
		get: () => 1000,
	});
}
