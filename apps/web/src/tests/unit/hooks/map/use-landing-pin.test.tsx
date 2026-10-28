/** @vitest-environment jsdom */
import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanupRenderedHooks, createFakeMap, renderHook } from '../../components/map/fake-map';

/** Every marker the runtime built, with where it was put and whether it is still on a map. */
const markers: FakeMarker[] = [];

class FakeMarker {
	readonly element: HTMLElement;
	readonly anchor: string | undefined;
	lngLat: readonly [number, number] | null = null;
	onMap = false;

	constructor(options: { readonly element: HTMLElement; readonly anchor?: string }) {
		this.element = options.element;
		this.anchor = options.anchor;
		markers.push(this);
	}

	setLngLat(lngLat: readonly [number, number]) {
		this.lngLat = lngLat;
		return this;
	}

	addTo() {
		this.onMap = true;
		return this;
	}

	remove() {
		this.onMap = false;
		return this;
	}
}

/**
 * Resolved by hand, so a case can drop a pin and clear it before the runtime
 * arrives, which is the order the real dynamic import allows.
 */
let releaseRuntime: (() => void) | null = null;
const runtime = { Marker: FakeMarker };
let loader: Promise<typeof runtime> = Promise.resolve(runtime);

vi.mock('../../../../components/map/mapbox-gl-loader', () => ({
	loadMapboxGl: () => loader,
}));

const { useLandingPin } = await import('../../../../hooks/map/use-landing-pin');

afterEach(() => {
	markers.length = 0;
	loader = Promise.resolve(runtime);
	releaseRuntime = null;
	cleanupRenderedHooks();
});

/** Let the loader's `then` run. */
async function settle() {
	await act(async () => {
		await loader;
	});
}

function pinsOnMap(): FakeMarker[] {
	return markers.filter((marker) => marker.onMap);
}

describe('useLandingPin', () => {
	it('drops a pin at the point, anchored at its tip and named for what it marks', async () => {
		const { map } = createFakeMap();
		const { result } = renderHook(useLandingPin, map);

		result.current.drop({ lng: -74.5, lat: 40.25 }, 'Search result Newark');
		await settle();

		expect(pinsOnMap()).toHaveLength(1);
		const [pin] = pinsOnMap();
		expect(pin?.lngLat).toEqual([-74.5, 40.25]);
		expect(pin?.anchor).toBe('bottom');
		expect(pin?.element.getAttribute('role')).toBe('img');
		expect(pin?.element.getAttribute('aria-label')).toBe('Search result Newark');
	});

	it('keeps one pin on the map, the latest', async () => {
		const { map } = createFakeMap();
		const { result } = renderHook(useLandingPin, map);

		result.current.drop({ lng: 1, lat: 2 }, 'First');
		await settle();
		result.current.drop({ lng: 3, lat: 4 }, 'Second');
		await settle();

		expect(markers).toHaveLength(2);
		expect(pinsOnMap().map((marker) => marker.lngLat)).toEqual([[3, 4]]);
	});

	it('takes the pin away on clear', async () => {
		const { map } = createFakeMap();
		const { result } = renderHook(useLandingPin, map);

		result.current.drop({ lng: 1, lat: 2 }, 'Here');
		await settle();
		result.current.clear();

		expect(pinsOnMap()).toEqual([]);
	});

	it('takes the pin away on unmount', async () => {
		const { map } = createFakeMap();
		const { result, unmount } = renderHook(useLandingPin, map);

		result.current.drop({ lng: 1, lat: 2 }, 'Here');
		await settle();
		unmount();

		expect(pinsOnMap()).toEqual([]);
	});

	it('takes the pin away when the map changes', async () => {
		const first = createFakeMap();
		const { result, rerender } = renderHook(useLandingPin, first.map as typeof first.map | null);

		result.current.drop({ lng: 1, lat: 2 }, 'Here');
		await settle();
		rerender(null);

		expect(pinsOnMap()).toEqual([]);
	});

	it('adds nothing when cleared before the runtime arrives', async () => {
		loader = new Promise((resolve) => {
			releaseRuntime = () => resolve(runtime);
		});
		const { map } = createFakeMap();
		const { result } = renderHook(useLandingPin, map);

		result.current.drop({ lng: 1, lat: 2 }, 'Stale');
		result.current.clear();
		releaseRuntime?.();
		await settle();

		expect(markers).toEqual([]);
	});

	it('drops nothing without a map', async () => {
		const { result } = renderHook(useLandingPin, null);

		result.current.drop({ lng: 1, lat: 2 }, 'Nowhere');
		await settle();

		expect(markers).toEqual([]);
	});
});
