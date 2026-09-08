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
/** Every map DOM this module built, for the `afterEach` to take back out. */
const mapDoms: HTMLElement[] = [];

/**
 * The map's own DOM, laid out the way mapbox's `_setupContainer` lays it out:
 * an interactive canvas carrying `tabindex="0"`, `role="region"` and an
 * `aria-label`, inside a canvas container, beside a control container holding
 * mapbox's own attribution button.
 *
 * Real elements rather than an object with a `style`, because the draw session
 * reads the canvas container to say whether a key was the map's, and takes the
 * canvas's focus when a draft opens. A stub answers neither question, and the
 * control container is what separates the map surface from a `<button>` mapbox
 * itself put on the page.
 */
function createMapDom() {
	const container = document.createElement('div');
	container.className = 'mapboxgl-map';
	const canvasContainer = document.createElement('div');
	canvasContainer.className = 'mapboxgl-canvas-container mapboxgl-interactive';
	const canvas = document.createElement('canvas');
	canvas.className = 'mapboxgl-canvas';
	canvas.tabIndex = 0;
	canvas.setAttribute('role', 'region');
	canvas.setAttribute('aria-label', 'Map');
	// jsdom lays nothing out, so the size a viewport read wants is declared here
	// rather than measured. A flat 1000x800, matching the unproject scale below.
	Object.defineProperty(canvas, 'clientWidth', { value: 1000 });
	Object.defineProperty(canvas, 'clientHeight', { value: 800 });
	const controlContainer = document.createElement('div');
	controlContainer.className = 'mapboxgl-control-container';
	const attributionButton = document.createElement('button');
	attributionButton.className = 'mapboxgl-ctrl-attrib-button';
	controlContainer.append(attributionButton);
	canvasContainer.append(canvas);
	container.append(canvasContainer, controlContainer);
	// In the document, because a key pressed in an element only bubbles out to
	// the `window` listener from a connected node, and `focus()` on a detached
	// one moves nothing.
	document.body.append(container);
	mapDoms.push(container);
	return { container, canvasContainer, canvas, attributionButton };
}

export function createFakeMap() {
	const sources = new Map<string, { data: GeoJSON.GeoJSON; tiles?: readonly string[] }>();
	const sourceSpecs = new Map<string, Record<string, unknown>>();
	const layers = new Map<string, LayerSpecification>();
	const handlers = new Map<string, Set<(event: unknown) => void>>();
	const cameraCalls: CameraCall[] = [];
	const { container, canvasContainer, canvas, attributionButton } = createMapDom();
	// A flat 0.001 degrees per pixel from the origin: enough for a test to say
	// which pixels were unprojected, which is the whole question.
	const DEGREES_PER_PIXEL = 0.001;
	const filterCalls: string[] = [];
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
						setTiles(tiles: readonly string[]) {
							source.tiles = tiles;
						},
					};
		},
		addSource(id: string, spec: { data: GeoJSON.GeoJSON; tiles?: readonly string[] }) {
			assertLive();
			sources.set(id, {
				data: spec.data,
				...(spec.tiles === undefined ? {} : { tiles: spec.tiles }),
			});
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
		setFilter(id: string, filter: unknown) {
			assertLive();
			const layer = layers.get(id);
			if (layer === undefined) {
				return;
			}
			layers.set(id, { ...layer, filter } as LayerSpecification);
			filterCalls.push(id);
		},
		getCanvas: () => canvas,
		getCanvasContainer: () => canvasContainer,
		getContainer: () => container,
		getZoom: () => 10,
		unproject([x, y]: [number, number]) {
			assertLive();
			return { lng: x * DEGREES_PER_PIXEL, lat: -y * DEGREES_PER_PIXEL };
		},
		/**
		 * Deliberately narrower than the canvas, the way mapbox answers once the
		 * map carries viewport padding. Anything reading the viewport off this
		 * rather than off the canvas gets the padded strip.
		 */
		getBounds: () => ({
			getEast: () => 0.4,
			getNorth: () => 0,
			getSouth: () => -0.8,
			getWest: () => 0.2,
		}),
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
		/** The div mapbox puts the canvas in, which is the map's key surface. */
		canvasContainer,
		/** The whole map, canvas surface and control corner together. */
		container,
		/** Mapbox's own button, inside the map but outside its key surface. */
		attributionButton,
		/** Every camera move asked for, in order, with the padding it carried. */
		cameraCalls: cameraCalls as readonly CameraCall[],
		queryRenderedFeatures: map.queryRenderedFeatures,
		isDoubleClickZoomEnabled: () => doubleClickZoomEnabled,
		/** The layer ids added, in add order, which is the order they draw in. */
		layerIds: () => [...layers.keys()],
		/** The tile templates a vector source is currently pointed at. */
		tilesOf: (sourceId: string) => sources.get(sourceId)?.tiles,
		/** Every `setFilter` call, in order, for asserting what was re-scoped. */
		filterCalls: filterCalls as readonly string[],
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
		/**
		 * A double-click, as the browser delivers one: both clicks land first, then
		 * `dblclick`.
		 *
		 * The two clicks are the reason the draw path dedupes a repeated last
		 * vertex, so a helper that fired `dblclick` alone would test a gesture
		 * nobody makes.
		 */
		doubleClick(lng: number, lat: number) {
			this.click(lng, lat);
			this.click(lng, lat);
			this.emit('dblclick', {
				lngLat: { lng, lat },
				point: { x: 0, y: 0 },
				preventDefault: () => {},
			});
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

/**
 * Drop every container this module mounted, the map DOMs included. Call from an
 * `afterEach`.
 */
export function cleanupRenderedHooks(): void {
	for (const container of [...containers.splice(0), ...mapDoms.splice(0)]) {
		container.remove();
	}
}

/** Press a key on `window`, where the draw and measure sessions listen. */
export function pressKey(key: string): void {
	act(() => {
		window.dispatchEvent(new KeyboardEvent('keydown', { key }));
	});
}

/**
 * Press a key inside `field`, the way the panel beside the map is typed into.
 *
 * The event bubbles, because that is the only way one pressed in a field reaches
 * the `window` listener at all, and it is what puts the field on `event.target`
 * for the session to read.
 */
export function pressKeyIn(field: HTMLElement, key: string): void {
	act(() => {
		field.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
	});
}
