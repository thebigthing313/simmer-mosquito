import type { LayerSpecification, Map as MapboxMap } from 'mapbox-gl';
import type { ReactElement } from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { vi } from 'vitest';

/**
 * Enough of a Mapbox map to hold sources and layers, and to replay the events
 * the map hooks actually listen for — chiefly `style.load`, which a basemap
 * switch fires *after* wiping every custom source and layer the map had.
 *
 * Shared by every hook that owns a GeoJSON source, because the thing worth
 * asserting is the same for all of them: what the style contains, and what the
 * source is holding, after an add, a restyle, and a teardown.
 */
export function createFakeMap() {
	const sources = new Map<string, { data: GeoJSON.GeoJSON }>();
	const sourceSpecs = new Map<string, Record<string, unknown>>();
	const layers = new Map<string, LayerSpecification>();
	const handlers = new Map<string, Set<(event: unknown) => void>>();
	const cameraCalls: CameraCall[] = [];
	const canvas = { style: { cursor: '' } };
	let removed = false;
	let doubleClickZoomEnabled = true;

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
		getZoom: () => 10,
		flyTo(options: CameraOptions) {
			assertLive();
			cameraCalls.push({ kind: 'flyTo', ...readCamera(options) });
		},
		easeTo(options: CameraOptions) {
			assertLive();
			cameraCalls.push({ kind: 'easeTo', ...readCamera(options) });
		},
		fitBounds(_bounds: unknown, options: CameraOptions) {
			assertLive();
			cameraCalls.push({ kind: 'fitBounds', ...readCamera(options) });
		},
		queryRenderedFeatures: vi.fn(() => [] as unknown[]),
		doubleClickZoom: {
			isEnabled: () => doubleClickZoomEnabled,
			enable() {
				assertLive();
				doubleClickZoomEnabled = true;
			},
			disable() {
				assertLive();
				doubleClickZoomEnabled = false;
			},
		},
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
		/** Every camera move asked for, in order, with the padding it carried. */
		cameraCalls: cameraCalls as readonly CameraCall[],
		queryRenderedFeatures: map.queryRenderedFeatures,
		isDoubleClickZoomEnabled: () => doubleClickZoomEnabled,
		listenerCount: (event: string) => handlers.get(event)?.size ?? 0,
		/** The data the source is currently holding, as a feature collection. */
		featuresOf(sourceId: string): readonly GeoJSON.Feature[] {
			const data = sources.get(sourceId)?.data;
			return data !== undefined && data.type === 'FeatureCollection' ? data.features : [];
		},
		emit(event: string, payload?: unknown) {
			for (const handler of [...(handlers.get(event) ?? [])]) {
				handler(payload);
			}
		},
		/** A map click at a position, as the draw and measure sessions read it. */
		click(lng: number, lat: number) {
			this.emit('click', { lngLat: { lng, lat }, point: { x: 0, y: 0 } });
		},
		move(lng: number, lat: number) {
			this.emit('mousemove', { lngLat: { lng, lat }, point: { x: 0, y: 0 } });
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

export type FakeMap = ReturnType<typeof createFakeMap>;

type CameraOptions = {
	readonly padding?: unknown;
	readonly zoom?: number;
	readonly duration?: number;
};

/**
 * One camera move, reduced to what a test asks about: which call it was and the
 * padding it carried. Padding is the interesting half — it is how a map with
 * chrome floating over it puts a record where the reader can see it.
 */
interface CameraCall {
	readonly kind: 'flyTo' | 'easeTo' | 'fitBounds';
	readonly padding: unknown;
	readonly zoom: number | undefined;
}

function readCamera(options: CameraOptions | undefined): Omit<CameraCall, 'kind'> {
	return { padding: options?.padding, zoom: options?.zoom };
}

// React only treats `act` as a real flush boundary when it is told it is in a
// test environment; without this every `act` call warns and updates queued by an
// event handler land after the assertion instead of before it.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const containers: HTMLElement[] = [];

/**
 * Mount a component that only calls a hook, and hand back its latest return
 * value along with a rerender/unmount pair.
 */
export function renderHook<Props, Result>(
	useHook: (props: Props) => Result,
	initial: Props,
): {
	readonly result: { readonly current: Result };
	readonly rerender: (next: Props) => void;
	readonly unmount: () => void;
} {
	const container = document.createElement('div');
	containers.push(container);
	const root = createRoot(container);
	let props = initial;
	const result = { current: undefined as Result };

	function Probe(): ReactElement | null {
		result.current = useHook(props);
		return null;
	}

	act(() => {
		root.render(<Probe />);
	});

	return {
		result,
		// Same element type and no key, so React updates in place. A changing key
		// would remount, re-run the setup effect, and quietly defeat the very
		// assertion this harness exists to make.
		rerender(next: Props) {
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

/** Drop every container this module mounted. Call from an `afterEach`. */
export function cleanupRenderedHooks(): void {
	for (const container of containers.splice(0)) {
		container.remove();
	}
}

/** Press a key on `window`, where the draw and measure sessions listen. */
export function pressKey(key: string): void {
	act(() => {
		window.dispatchEvent(new KeyboardEvent('keydown', { key }));
	});
}
