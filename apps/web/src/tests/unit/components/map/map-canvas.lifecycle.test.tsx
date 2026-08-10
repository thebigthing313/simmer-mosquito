// @vitest-environment jsdom
import { TooltipProvider } from '@simmer-mosquito/ui-web/components/ui/tooltip';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

// biome-ignore lint/suspicious/noExplicitAny: react act environment flag
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
// biome-ignore lint/suspicious/noExplicitAny: jsdom has no ResizeObserver
(globalThis as any).ResizeObserver = class {
	observe() {}
	unobserve() {}
	disconnect() {}
};

/**
 * A stand-in for the GL runtime that reproduces the one behaviour this suite is
 * about: after `map.remove()` mapbox sets `this.style = undefined`, and every
 * style read (`getSource` -> `this.style.getOwnSource(id)`) throws the exact
 * TypeError issue #132 reports.
 */
const created: FakeMap[] = [];

class FakeStyle {
	readonly sources = new Map<string, unknown>();
	readonly layers = new Map<string, unknown>();
	getOwnSource(id: string) {
		return this.sources.get(id);
	}
	getOwnLayer(id: string) {
		return this.layers.get(id);
	}
}

class FakeMap {
	style: FakeStyle | undefined = new FakeStyle();
	_canvas: { style: { cursor: string } } | undefined = { style: { cursor: '' } };
	readonly handlers = new Map<string, Set<(event: unknown) => void>>();
	removed = false;

	getSource(id: string) {
		return (this.style as FakeStyle).getOwnSource(id);
	}
	getLayer(id: string) {
		return (this.style as FakeStyle).getOwnLayer(id);
	}
	addSource(id: string, spec: unknown) {
		(this.style as FakeStyle).sources.set(id, {
			setData: () => undefined,
			setTiles: () => undefined,
			spec,
		});
	}
	addLayer(layer: { id: string }) {
		(this.style as FakeStyle).layers.set(layer.id, layer);
	}
	removeLayer(id: string) {
		(this.style as FakeStyle).layers.delete(id);
	}
	removeSource(id: string) {
		(this.style as FakeStyle).sources.delete(id);
	}
	setFilter(id: string) {
		(this.style as FakeStyle).getOwnLayer(id);
	}
	setFeatureState() {
		(this.style as FakeStyle).sources.size;
	}
	getCanvas() {
		return this._canvas as { style: { cursor: string } };
	}
	queryRenderedFeatures() {
		return [] as unknown[];
	}
	getZoom() {
		return 10;
	}
	getBearing() {
		return 0;
	}
	getCenter() {
		return { lng: -95.7, lat: 37.1 };
	}
	getBounds() {
		return null;
	}
	zoomIn() {}
	zoomOut() {}
	rotateTo() {}
	flyTo() {}
	easeTo() {}
	fitBounds() {}
	resize() {}
	setStyle() {}
	addControl() {}
	on(event: string, handler: (event: unknown) => void) {
		const set = this.handlers.get(event) ?? new Set();
		set.add(handler);
		this.handlers.set(event, set);
	}
	off(event: string, handler: (event: unknown) => void) {
		this.handlers.get(event)?.delete(handler);
	}
	fire(event: string, payload?: unknown) {
		for (const handler of [...(this.handlers.get(event) ?? [])]) {
			handler(payload);
		}
	}
	remove() {
		// What mapbox-gl actually does: setStyle(null) drops the style object.
		this.style = undefined;
		this._canvas = undefined;
		this.removed = true;
	}
}

const fakeRuntime = {
	accessToken: '',
	Map: class {
		constructor() {
			const instance = new FakeMap();
			created.push(instance);
			// biome-ignore lint/correctness/noConstructorReturn: stand-in factory
			return instance as unknown as never;
		}
	},
	AttributionControl: class {},
	Marker: class {},
};

/**
 * The loader is a real dynamic import in the app: it resolves a few turns after
 * the effect that asked for it, not in the same microtask. Tests decide when.
 */
let releaseRuntime: (() => void) | null = null;
let pendingLoader: Promise<typeof fakeRuntime> | null = null;

vi.mock('../../../../components/map/mapbox-gl-loader', () => ({
	loadMapboxGl: () => {
		pendingLoader ??= new Promise<typeof fakeRuntime>((resolve) => {
			releaseRuntime = () => resolve(fakeRuntime);
		});
		return pendingLoader;
	},
}));

vi.stubEnv('VITE_MAPBOX_ACCESS_TOKEN', 'pk.test');

const { RouteMap } = await import('../../../../components/route-planning/route-map');

const roots: Array<{ container: HTMLElement; unmount: () => void }> = [];

function wrap(element: React.ReactNode) {
	return (
		<StrictMode>
			<QueryClientProvider client={new QueryClient()}>
				<TooltipProvider>{element}</TooltipProvider>
			</QueryClientProvider>
		</StrictMode>
	);
}

function mount(element: React.ReactNode) {
	const container = document.createElement('div');
	document.body.append(container);
	const root = createRoot(container);
	act(() => {
		root.render(wrap(element));
	});
	const handle = {
		container,
		rerender(next: React.ReactNode) {
			act(() => {
				root.render(wrap(next));
			});
		},
		unmount() {
			act(() => {
				root.unmount();
			});
		},
	};
	roots.push(handle);
	return handle;
}

/** Resolve the GL runtime and let React flush every state update it causes. */
async function loadRuntime() {
	await act(async () => {
		releaseRuntime?.();
		await Promise.resolve();
		await Promise.resolve();
		await Promise.resolve();
	});
}

async function flush() {
	await act(async () => {
		await Promise.resolve();
		await Promise.resolve();
	});
}

function latest(): FakeMap {
	const instance = created.at(-1);
	if (instance === undefined) {
		throw new Error('no map was created');
	}
	return instance;
}

afterEach(() => {
	for (const handle of roots.splice(0)) {
		try {
			handle.unmount();
		} catch {
			// already unmounted by the test
		}
		handle.container.remove();
	}
	created.length = 0;
	pendingLoader = null;
	releaseRuntime = null;
});

const STOPS = [
	{ id: 'stop-1', lng: -90.1, lat: 35.1, ordinal: 1, tone: 'default' as const },
	{ id: 'stop-2', lng: -90.2, lat: 35.2, ordinal: 2, tone: 'default' as const },
];

describe('RouteMap lifecycle (issue #132)', () => {
	it('creates exactly one map and draws the route', async () => {
		mount(<RouteMap features={STOPS} fitKey="route-1" stops={[]} />);
		await loadRuntime();
		act(() => {
			latest().fire('load');
		});

		expect(created).toHaveLength(1);
		expect(latest().style?.sources.has('route-sites')).toBe(true);
	});

	// The page renders before the on-demand route-item + habitat subsets resolve,
	// so the stop set arrives while the GL runtime is still being fetched.
	it('survives stops arriving while the runtime is still loading', async () => {
		const handle = mount(<RouteMap features={[]} fitKey="route-1" stops={[]} />);
		handle.rerender(<RouteMap features={STOPS} fitKey="route-1" stops={[]} />);
		await loadRuntime();
		act(() => {
			latest().fire('load');
		});

		expect(latest().style?.sources.has('route-sites')).toBe(true);
	});

	it('survives unmount at every point in the load', async () => {
		const beforeRuntime = mount(<RouteMap features={STOPS} fitKey="route-1" stops={[]} />);
		expect(() => {
			beforeRuntime.unmount();
		}).not.toThrow();

		const beforeStyle = mount(<RouteMap features={STOPS} fitKey="route-2" stops={[]} />);
		await loadRuntime();
		expect(() => {
			beforeStyle.unmount();
		}).not.toThrow();

		const afterStyle = mount(<RouteMap features={STOPS} fitKey="route-3" stops={[]} />);
		await flush();
		act(() => {
			latest().fire('load');
		});
		expect(() => {
			afterStyle.unmount();
		}).not.toThrow();
	});

	/*
	 * Issue #132. The route detail page renders its stop list only once the route
	 * items resolve — after the map is already up — and that list reads two
	 * catalogs through `useLiveSuspenseQuery`. Suspending there hides the whole
	 * route subtree, map included: React disconnects the subtree's passive
	 * effects (which is what destroys the GL instance) and, when the catalogs
	 * arrive, reconnects them *without re-rendering first*. Every hook is handed
	 * back the map it already had — the one `remove()` just emptied.
	 */
	it('survives a sibling suspending after the map has loaded', async () => {
		let resolveCatalog = () => {};
		const catalog = new Promise<void>((resolve) => {
			resolveCatalog = () => resolve();
		});
		let catalogReady = false;

		function SuspendingSibling() {
			if (!catalogReady) {
				throw catalog;
			}
			return null;
		}

		function Page({ withSibling }: { readonly withSibling: boolean }) {
			return (
				<Suspense fallback={<p>loading</p>}>
					<RouteMap features={STOPS} fitKey="route-1" stops={[]} />
					{withSibling ? <SuspendingSibling /> : null}
				</Suspense>
			);
		}

		const handle = mount(<Page withSibling={false} />);
		await loadRuntime();
		act(() => {
			latest().fire('load');
		});
		const first = latest();
		expect(first.style?.sources.has('route-sites')).toBe(true);

		// The stop list mounts and suspends: React hides the map subtree.
		handle.rerender(<Page withSibling />);
		await flush();

		// The catalogs arrive: React re-shows the subtree and reconnects effects.
		catalogReady = true;
		resolveCatalog();
		await flush();
		await flush();

		// The hide destroyed the GL instance, so the reconnect builds a replacement
		// rather than drawing onto the corpse of the old one.
		expect(first.removed).toBe(true);
		expect(latest()).not.toBe(first);
		act(() => {
			latest().fire('load');
		});
		expect(latest().style?.sources.has('route-sites')).toBe(true);
	});

	// RouteDetailPage swaps the whole map away for "Route Not Found" the moment the
	// route set reports ready without the row, then swaps it back when it arrives.
	it('survives being swapped away and back mid-load', async () => {
		const handle = mount(<RouteMap features={STOPS} fitKey="route-1" stops={[]} />);
		await loadRuntime();
		act(() => {
			latest().fire('load');
		});

		handle.rerender(<div />);
		handle.rerender(<RouteMap features={STOPS} fitKey="route-1" stops={[]} />);
		await flush();
		act(() => {
			latest().fire('load');
		});

		expect(latest().removed).toBe(false);
	});
});
