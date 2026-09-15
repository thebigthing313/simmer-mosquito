/**
 * What a suite rendering a whole explorer route fakes, shared between the
 * routes that do it.
 *
 * `traps-empty-state.test.tsx` wrote these out first and
 * `addresses-viewport.test.tsx` was about to be a second copy of sixty-eight
 * lines, with the service-request conversion (#963) queued to be a third.
 * `vi.mock` is hoisted per file and has to stay in the suite, but what the
 * factory hands back does not: the canvas stand-in, the role ladder and the
 * layout stubs are ordinary modules a factory can `import()`. The third suite
 * (#963) moved the preload and the render in here too; the router and the
 * transport stand-ins are in `route-mock-stand-ins.tsx`, whose header says why
 * a factory for `@simmer-mosquito/sync` cannot reach this module.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, type RenderResult, render, screen } from '@testing-library/react';
import type { Map as MapboxMap } from 'mapbox-gl';
import { type ReactNode, Suspense, useEffect } from 'react';
import { webShellDomains } from '../../../components/app-shell/navigation';
import type { MapTileLayer } from '../../../components/map/tile-layers';
import { tileLayerExtentUrl } from '../../../components/map/tile-layers';
import { useMapExtent } from '../../../components/map/use-map-extent-fit';
import type { MinimumRole } from '../../../lib/write-access';
import { createFakeMap } from '../components/map/fake-map';

type SplitComponent = (() => ReactNode) & { readonly preload?: () => Promise<unknown> };

/**
 * The route's component, imported and preloaded, for the reason
 * `write-attribution.test.tsx` gives: the split build hands back a lazy stand-in
 * whose first render pulls the route's whole dependency tree, which overruns a
 * test timeout with nothing saying so. Call it from a `beforeAll` with a hook
 * timeout that fits.
 */
export async function preloadRouteComponent(
	load: () => Promise<{ readonly Route: { readonly options: { readonly component?: unknown } } }>,
	name: string,
): Promise<() => ReactNode> {
	const module = await load();
	const component = module.Route.options.component as SplitComponent | undefined;
	if (typeof component !== 'function') {
		throw new Error(`The ${name} route declares no component.`);
	}
	await component.preload?.();
	return component;
}

/** A route component under a fresh query client, with no retries to wait out. */
export function renderExplorer(Explorer: () => ReactNode): RenderResult {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	return render(
		<QueryClientProvider client={client}>
			<Suspense fallback={<span>loading</span>}>
				<Explorer />
			</Suspense>
		</QueryClientProvider>,
	);
}

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

/**
 * The three places a create surface is named on one explorer, read off the
 * rendered page and the sidebar register together, so a suite can assert they
 * are one string (#949).
 *
 * The sidebar entry is read out of `webShellDomains` by destination, since that
 * is the key `check:nav-labels` selects an entry by. The header control is a
 * menu item in the map frame, so the menu is opened the way a pointer would,
 * and the pointer is the empty state's sentence, which reads the same `label`
 * the menu draws. Both are found by the sidebar's own words, because the three
 * agreeing by construction is the whole point and a suite that spelled the
 * label itself would be a fourth copy.
 */
export async function createSurfaceNames(to: string): Promise<{
	readonly sidebar: string;
	readonly header: string;
	readonly pointer: string;
}> {
	const entry = webShellDomains
		.flatMap((domain) => domain.groups)
		.flatMap((group) => group.items)
		.find((item) => item.to === to);
	if (entry === undefined) {
		throw new Error(`no sidebar entry lands on ${to}`);
	}
	fireEvent.pointerDown(
		screen.getByRole('button', { name: 'More actions' }),
		new PointerEvent('pointerdown', { bubbles: true, ctrlKey: false, button: 0 }),
	);
	const header = (await screen.findByRole('menuitem', { name: entry.label })).textContent ?? '';
	const pointer = screen.getByText(`${entry.label} is in the More actions menu.`).textContent ?? '';
	return { sidebar: entry.label, header, pointer };
}
