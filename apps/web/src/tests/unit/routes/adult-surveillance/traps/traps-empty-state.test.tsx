/** @vitest-environment jsdom */

/**
 * The traps explorer, rendered whole, through the three things its rail can say
 * when the page holds nothing (#958).
 *
 * `use-explorer-resource.test.tsx` holds the rule at the hook, and
 * `explorer-map-page.test.tsx` holds the copy at the frame. This is the seam
 * between them on one real route: that the route hands the frame the emptiness
 * its resource reports, that the extent the empty state reads is the one the
 * map frames, so the surface still spends one extent and one page, and that
 * the default status filter counts as a filter. Traps opens on `status=active`
 * and `activeFilterCount` says zero there, so a null extent at the defaults is
 * "no active traps", which is the `filters` branch and not "no traps yet".
 * Only `status=all` sends an unfiltered extent, and only then is `none` true.
 *
 * What is faked is what `write-attribution.test.tsx` fakes, for the reason its
 * docblock gives: the route module's `Route` hands back the search a match
 * would, `MapCanvas` becomes a stand-in that reports a fake map and observes
 * the extent the way the real one does under `fitToData`, and the role comes
 * from a variable. The stand-in, the role ladder and the layout stubs are in
 * `explorer-route-harness.tsx`, shared with the other route suites that render
 * a whole explorer. The component is preloaded first, since the split build's
 * lazy stand-in would otherwise overrun the test timeout while it imports.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { type ReactNode, Suspense } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { organizations } from '../../../../../lib/collections/organizations';
import type { MinimumRole } from '../../../../../lib/write-access';
import { installMemoryCollections, seedRows } from '../../../lib/collections/memory-collections';
import { stubPanelLayout } from '../../explorer-route-harness';

const harness = vi.hoisted(() => ({
	/** The search params a match would carry: the route's filters. */
	search: {} as Record<string, unknown>,
	/** Every request the route sent, in order. */
	sent: [] as URL[],
	/** What the extent endpoint answers. Null is the server's "nothing matched". */
	extent: null as unknown,
	/** Who is signed in, for the role floor the create pointer sits behind. */
	role: 'admin' as string,
}));

vi.mock('@tanstack/react-router', async (importOriginal) => {
	const actual = await importOriginal<typeof import('@tanstack/react-router')>();
	return {
		...actual,
		createFileRoute: () => (options: Record<string, unknown>) => ({
			...options,
			options,
			useSearch: () => harness.search,
		}),
		useSearch: () => harness.search,
		useNavigate: () => async () => undefined,
		Link: ({ children, ...rest }: { children?: ReactNode }) => <a {...rest}>{children}</a>,
	};
});

vi.mock('@simmer-mosquito/sync', async (importOriginal) => ({
	...(await importOriginal<typeof import('@simmer-mosquito/sync')>()),
	sessionFetch: (input: URL | string) => {
		const url = input instanceof URL ? input : new URL(input);
		harness.sent.push(url);
		const body = url.pathname.endsWith('/extent')
			? { extent: harness.extent }
			: { traps: [], total: 0 };
		return Promise.resolve({
			ok: true,
			status: 200,
			json: () => Promise.resolve(body),
		} as Response);
	},
}));

vi.mock('../../../../../hooks/use-can-write', async () => {
	const { roleReaches } = await import('../../explorer-route-harness');
	return { useHasRole: (minimum: MinimumRole) => roleReaches(harness.role, minimum) };
});

// The canvas stand-in, the role ladder and the layout stubs are the harness
// beside the route suites; its header says why they live there.
vi.mock('../../../../../components/map', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../../../../../components/map')>();
	const { MapCanvasStandIn } = await import('../../explorer-route-harness');
	return { ...actual, MapCanvas: MapCanvasStandIn };
});

stubPanelLayout();

type SplitComponent = (() => ReactNode) & { readonly preload?: () => Promise<unknown> };

let TrapsExplorer: () => ReactNode;

beforeAll(async () => {
	const module = await import('../../../../../routes/adult-surveillance/traps/index');
	const component = module.Route.options.component as SplitComponent | undefined;
	if (typeof component !== 'function') {
		throw new Error('The traps route declares no component.');
	}
	await component.preload?.();
	TrapsExplorer = component;
}, 300_000);

beforeEach(() => {
	installMemoryCollections();
	seedRows(organizations, [{ id: 'org-1', name: 'Test Mosquito Control', settings: {} }]);
	harness.search = {};
	harness.sent.length = 0;
	harness.extent = null;
	harness.role = 'admin';
});

afterEach(() => {
	cleanup();
});

function renderTraps() {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	return render(
		<QueryClientProvider client={client}>
			<Suspense fallback={<span>loading</span>}>
				<TrapsExplorer />
			</Suspense>
		</QueryClientProvider>,
	);
}

function requestCounts(): { readonly page: number; readonly extent: number } {
	return {
		page: harness.sent.filter((url) => url.pathname === '/map/traps').length,
		extent: harness.sent.filter((url) => url.pathname === '/map/tiles/traps/extent').length,
	};
}

describe('the traps explorer with nothing on the page', () => {
	it('spends one extent and one page, with the map and the rail reading the same extent', async () => {
		harness.search = { status: 'all' };
		renderTraps();

		await screen.findByText('No traps yet');
		expect(requestCounts()).toEqual({ page: 1, extent: 1 });
		expect(harness.sent.find((url) => url.pathname.endsWith('/extent'))?.search).toBe('');
	});

	it('says there are none yet, and where to add one, once every filter is off', async () => {
		harness.search = { status: 'all' };
		renderTraps();

		expect(await screen.findByText('No traps yet')).toBeTruthy();
		expect(screen.getByText('Add Trap is in the More actions menu.')).toBeTruthy();
	});

	it('keeps the pointer from a reader below the floor the control needs', async () => {
		harness.role = 'viewer';
		harness.search = { status: 'all' };
		renderTraps();

		expect(await screen.findByText('No traps yet')).toBeTruthy();
		expect(screen.queryByText('Add Trap is in the More actions menu.')).toBeNull();
	});

	// The route opens on active traps, and the extent it sends says so. A null
	// answer there is about active traps, so the rail says the filters did it
	// and opens the card that holds the status control.
	it('reads the default status as a filter and opens the filter card', async () => {
		renderTraps();

		expect(await screen.findByText('No traps match these filters')).toBeTruthy();
		expect(harness.sent.find((url) => url.pathname.endsWith('/extent'))?.search).toBe(
			'?status=active',
		);
		expect(screen.queryByText('No traps yet')).toBeNull();

		fireEvent.click(screen.getByRole('button', { name: 'Show filters' }));
		expect(screen.getByText('Status')).toBeTruthy();
	});

	it('offers the reset when a filter the reader set matches nothing', async () => {
		harness.search = { search: 'gravid' };
		renderTraps();

		expect(await screen.findByText('No traps match these filters')).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Reset filters' })).toBeTruthy();
	});

	it('says to pan when the extent frames traps the viewport does not hold', async () => {
		harness.extent = { west: -1, south: -1, east: 1, north: 1 };
		renderTraps();

		expect(await screen.findByText('No traps in view')).toBeTruthy();
		expect(
			screen.getByText('Pan or zoom the map, or loosen the filters to bring traps into range.'),
		).toBeTruthy();
		await waitFor(() => expect(requestCounts()).toEqual({ page: 1, extent: 1 }));
	});
});
