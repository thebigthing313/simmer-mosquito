/** @vitest-environment jsdom */

/**
 * The addresses explorer, rendered whole, paging the map's viewport (#962).
 *
 * The rail used to be the whole Organization's address book out of the sync
 * collection, filtered and paged in the browser beside a map whose tile layer
 * drew one viewport, so the two showed different sets. It reads `/map/addresses`
 * through `useExplorerResource` now, the way the nine paged explorers do. This
 * is the seam on the real route: that the page request carries the box the map
 * reports ahead of the surface's filters, that the rail lists what the page
 * answered and nothing else, that the collapsed panel counts it `in view`, and
 * that the three things an empty rail can say (#958) are what this surface says.
 *
 * The server stand-in applies the box itself, holding one address outside the
 * fake map's viewport beside two inside it, so "only rows inside the viewport"
 * is asserted against a reader that narrows rather than against a list the
 * suite wrote out. What the real reader narrows by is
 * `map-surface.integration.test.ts`'s case against Postgres.
 *
 * Unlike the nine, this surface opens on no filter at all, so a null extent at
 * the defaults is the `none` branch rather than `filters`: an Organization with
 * no addresses reads `No addresses yet` on first open.
 *
 * What is faked is what `traps-empty-state.test.tsx` fakes, for the reasons its
 * docblock gives, and the component is preloaded first for the reason
 * `write-attribution.test.tsx` gives.
 */

import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { organizations } from '../../../../../lib/collections/organizations';
import type { MinimumRole } from '../../../../../lib/write-access';
import { installMemoryCollections, seedRows } from '../../../lib/collections/memory-collections';
import {
	preloadRouteComponent,
	renderExplorer,
	stubPanelLayout,
} from '../../explorer-route-harness';

/** An address as `/map/addresses` answers it, with only what the rail reads. */
interface AddressRow {
	readonly id: string;
	readonly lat: number;
	readonly lng: number;
	readonly displayName: string;
	readonly country: string;
	readonly addressLine1: string | null;
	readonly addressLine2: string | null;
	readonly locality: string | null;
	readonly region: string | null;
	readonly postalCode: string | null;
}

function address(id: string, displayName: string, lng: number, lat: number): AddressRow {
	return {
		id,
		lat,
		lng,
		displayName,
		country: 'US',
		addressLine1: displayName,
		addressLine2: null,
		locality: 'Monroe Township',
		region: 'NJ',
		postalCode: '08831',
	};
}

/**
 * The fake map's canvas unprojects to the box `0,-0.8,1,0`. Two addresses sit
 * inside it and one sits a degree east of it, which a rail listing the whole
 * book would show and a rail listing the viewport must not.
 */
const INSIDE_A = address('a1b2c3d4-0000-4000-8000-000000000001', '1 11th Street', 0.5, -0.4);
const INSIDE_B = address('a1b2c3d4-0000-4000-8000-000000000002', '2 Elm Court', 0.6, -0.5);
const OUTSIDE = address('a1b2c3d4-0000-4000-8000-000000000003', '9 Far Lane', 2, -0.4);

const harness = vi.hoisted(() => ({
	/** The search params a match would carry: the route's filters. */
	search: {} as Record<string, unknown>,
	/** Every request the route sent, in order. */
	sent: [] as URL[],
	/** What the extent endpoint answers. Null is the server's "nothing matched". */
	extent: null as unknown,
	/** The address book the stand-in server pages, before the box narrows it. */
	book: [] as readonly {
		readonly id: string;
		readonly lat: number;
		readonly lng: number;
		readonly displayName: string;
	}[],
	/** Who is signed in, for the role floor the create pointer sits behind. */
	role: 'admin' as string,
}));

vi.mock('@tanstack/react-router', async (importOriginal) => {
	const { routerStandIn } = await import('../../route-mock-stand-ins');
	return routerStandIn(await importOriginal<object>(), () => harness.search);
});

vi.mock('@simmer-mosquito/sync', async (importOriginal) => {
	const { sessionFetchStandIn } = await import('../../route-mock-stand-ins');
	return {
		...(await importOriginal<typeof import('@simmer-mosquito/sync')>()),
		sessionFetch: sessionFetchStandIn(harness.sent, (url) =>
			url.pathname.endsWith('/extent')
				? { extent: harness.extent }
				: pageInsideBox(url.searchParams.get('bbox'), url.searchParams.get('search')),
		),
	};
});

/**
 * What the bounds reader does, in miniature: the rows inside the box that
 * match the search, and a total over them. A request with no box is refused
 * the way the real route refuses one, so a rail that stopped sending it would
 * fail here rather than list the whole book.
 */
function pageInsideBox(bbox: string | null, search: string | null) {
	if (bbox === null) {
		throw new Error('bbox is required.');
	}
	const [west, south, east, north] = bbox.split(',').map(Number) as [
		number,
		number,
		number,
		number,
	];
	const needle = search?.toLowerCase() ?? '';
	const addresses = harness.book.filter(
		(row) =>
			row.lng >= west &&
			row.lng <= east &&
			row.lat >= south &&
			row.lat <= north &&
			row.displayName.toLowerCase().includes(needle),
	);
	return { addresses, total: addresses.length };
}

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

let AddressesExplorer: () => ReactNode;

beforeAll(async () => {
	AddressesExplorer = await preloadRouteComponent(
		() => import('../../../../../routes/gis/addresses/index'),
		'addresses',
	);
}, 300_000);

beforeEach(() => {
	installMemoryCollections();
	seedRows(organizations, [{ id: 'org-1', name: 'Test Mosquito Control', settings: {} }]);
	harness.search = {};
	harness.sent.length = 0;
	harness.extent = null;
	harness.book = [];
	harness.role = 'admin';
});

afterEach(() => {
	cleanup();
});

function renderAddresses() {
	return renderExplorer(AddressesExplorer);
}

function requestCounts(): { readonly page: number; readonly extent: number } {
	return {
		page: harness.sent.filter((url) => url.pathname === '/map/addresses').length,
		extent: harness.sent.filter((url) => url.pathname === '/map/tiles/addresses/extent').length,
	};
}

function pageRequest(): URL | undefined {
	return harness.sent.find((url) => url.pathname === '/map/addresses');
}

describe('the addresses explorer paging the viewport', () => {
	it('sends the box ahead of the filters and lists only the addresses inside it', async () => {
		harness.book = [INSIDE_A, INSIDE_B, OUTSIDE];
		harness.extent = { west: 0, south: -1, east: 3, north: 0 };
		renderAddresses();

		expect(await screen.findByText('1 11th Street')).toBeTruthy();
		expect(screen.getByText('2 Elm Court')).toBeTruthy();
		// The third address is this Organization's and is off screen. The rail
		// used to list it; the map never drew it.
		expect(screen.queryByText('9 Far Lane')).toBeNull();
		expect(pageRequest()?.search).toBe('?limit=50&offset=0&bbox=0%2C-0.8%2C1%2C0');
		expect(requestCounts()).toEqual({ page: 1, extent: 1 });
	});

	it('counts what is in view once the panel is collapsed', async () => {
		harness.book = [INSIDE_A, INSIDE_B, OUTSIDE];
		harness.extent = { west: 0, south: -1, east: 3, north: 0 };
		renderAddresses();

		await screen.findByText('1 11th Street');
		// Expanded, the count is the pager's, under the register's noun.
		expect(screen.getByText('2 addresses')).toBeTruthy();

		fireEvent.click(screen.getByRole('button', { name: 'Hide results' }));

		expect(screen.getByText('2 in view')).toBeTruthy();
		expect(screen.queryByText('3 addresses')).toBeNull();
	});

	it('carries the search and the region as query params the reader takes', async () => {
		harness.search = {
			search: 'elm',
			regions: 'b1b2c3d4-0000-4000-8000-000000000009',
		};
		harness.book = [INSIDE_A, INSIDE_B, OUTSIDE];
		harness.extent = { west: 0, south: -1, east: 1, north: 0 };
		renderAddresses();

		expect(await screen.findByText('2 Elm Court')).toBeTruthy();
		expect(screen.queryByText('1 11th Street')).toBeNull();
		expect(pageRequest()?.search).toBe(
			'?limit=50&offset=0&bbox=0%2C-0.8%2C1%2C0&search=elm&regionId=b1b2c3d4-0000-4000-8000-000000000009',
		);
		// The map's extent request carries the same two filters and no box, so the
		// tiles and the rail are one filtered set framed whole.
		expect(harness.sent.find((url) => url.pathname.endsWith('/extent'))?.search).toBe(
			'?search=elm&regionId=b1b2c3d4-0000-4000-8000-000000000009',
		);
	});
});

describe('the addresses explorer with nothing on the page', () => {
	it('says there are none yet, and where to add one, on first open', async () => {
		renderAddresses();

		expect(await screen.findByText('No addresses yet')).toBeTruthy();
		expect(screen.getByText('Create Address is in the More Actions menu.')).toBeTruthy();
		// No default narrows this surface, so the extent it sends is unfiltered
		// and a null answer is about the whole address book.
		expect(harness.sent.find((url) => url.pathname.endsWith('/extent'))?.search).toBe('');
		expect(requestCounts()).toEqual({ page: 1, extent: 1 });
	});

	it('keeps the pointer from a reader below the floor the control needs', async () => {
		harness.role = 'viewer';
		renderAddresses();

		expect(await screen.findByText('No addresses yet')).toBeTruthy();
		expect(screen.queryByText('Create Address is in the More Actions menu.')).toBeNull();
	});

	it('offers the reset when a search matches nothing anywhere', async () => {
		harness.search = { search: 'nowhere' };
		renderAddresses();

		expect(await screen.findByText('No addresses match these filters')).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Reset Filters' })).toBeTruthy();
		expect(screen.queryByText('No addresses yet')).toBeNull();
	});

	it('says to pan when the extent frames addresses the viewport does not hold', async () => {
		harness.book = [OUTSIDE];
		harness.extent = { west: 1.9, south: -0.5, east: 2.1, north: -0.3 };
		renderAddresses();

		expect(await screen.findByText('No addresses in view')).toBeTruthy();
		expect(
			screen.getByText('Pan or zoom the map, or loosen the filters to bring addresses into range.'),
		).toBeTruthy();
		await waitFor(() => expect(requestCounts()).toEqual({ page: 1, extent: 1 }));
	});
});
