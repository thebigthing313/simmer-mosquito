/** @vitest-environment jsdom */

/**
 * The service requests explorer, rendered whole, paging the map's viewport
 * (#963).
 *
 * The rail used to be the whole Organization's requests out of the sync
 * collection, filtered and paged in the browser beside a GeoJSON overlay drawn
 * from the same rows, 1,180 of them in the prod clone. It reads
 * `/map/service-requests` through `useExplorerResource` now, the way the ten
 * other paged explorers do, and the map draws the `service-requests` tileset.
 * This is the seam on the real route: that the page request carries the box the
 * map reports ahead of the surface's filters, that the rail lists what the page
 * answered and nothing else, that the collapsed panel counts it `in view`, and
 * that the three things an empty rail can say (#958) are what this surface says.
 *
 * The server stand-in applies the box and the status itself, holding one
 * request outside the fake map's viewport beside two inside it, so "only rows
 * inside the viewport" is asserted against a reader that narrows rather than
 * against a list the suite wrote out. What the real reader narrows by is
 * `map-surface.integration.test.ts`'s case against Postgres.
 *
 * Like traps, this surface opens narrowed, on this year's requests, so a null
 * extent at the defaults is the `filters` branch and the `none` branch needs
 * All time spelled out. The clock is pinned so this year is one year. What is faked is what `traps-empty-state.test.tsx` fakes, for
 * the reasons its docblock gives, and the component is preloaded first for the
 * reason `write-attribution.test.tsx` gives.
 */

import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { organizations } from '../../../../../lib/collections/organizations';
import type { MinimumRole } from '../../../../../lib/write-access';
import { installMemoryCollections, seedRows } from '../../../lib/collections/memory-collections';
import {
	createSurfaceNames,
	preloadRouteComponent,
	renderExplorer,
	stubPanelLayout,
} from '../../explorer-route-harness';

/** A request as `/map/service-requests` answers it, with only what the rail reads. */
interface RequestRow {
	readonly id: string;
	readonly lat: number;
	readonly lng: number;
	readonly displayName: number;
	readonly requestDate: string;
	readonly details: string;
	readonly contactId: string;
	readonly addressId: string;
	readonly closedAt: string | null;
}

function request(
	id: string,
	displayName: number,
	lng: number,
	lat: number,
	closedAt: string | null = null,
): RequestRow {
	return {
		id,
		lat,
		lng,
		displayName,
		requestDate: '2026-08-04',
		details: 'Standing water behind the garage.',
		contactId: 'c1b2c3d4-0000-4000-8000-000000000001',
		addressId: 'a1b2c3d4-0000-4000-8000-000000000001',
		closedAt,
	};
}

/**
 * The fake map's canvas unprojects to the box `0,-0.8,1,0`. Two requests sit
 * inside it and one sits a degree east of it, which a rail listing the whole
 * Organization would show and a rail listing the viewport must not. One of the
 * two inside is closed, so a Status of Open narrows it out.
 */
const INSIDE_OPEN = request('d1b2c3d4-0000-4000-8000-000000000001', 12, 0.5, -0.4);
const INSIDE_CLOSED = request(
	'd1b2c3d4-0000-4000-8000-000000000002',
	13,
	0.6,
	-0.5,
	'2026-08-10T15:00:00.000Z',
);
const OUTSIDE = request('d1b2c3d4-0000-4000-8000-000000000003', 99, 2, -0.4);

/** Every request whenever received, which is the explorer's own `any`. */
const ALL_TIME = { from: 'any', to: 'any' } as const;

const harness = vi.hoisted(() => ({
	/** The search params a match would carry: the route's filters. */
	search: {} as Record<string, unknown>,
	/** Every request the route sent, in order. */
	sent: [] as URL[],
	/** What the extent endpoint answers. Null is the server's "nothing matched". */
	extent: null as unknown,
	/** The requests the stand-in server pages, before the box narrows them. */
	requests: [] as readonly {
		readonly id: string;
		readonly lat: number;
		readonly lng: number;
		readonly displayName: number;
		readonly details: string;
		readonly closedAt: string | null;
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
				: pageInsideBox(url.searchParams),
		),
	};
});

/**
 * What the bounds reader does, in miniature: the rows inside the box that match
 * the status and the search, and a total over them. A request with no box is
 * refused the way the real route refuses one, so a rail that stopped sending it
 * would fail here rather than list the whole Organization.
 */
function pageInsideBox(params: URLSearchParams) {
	const bbox = params.get('bbox');
	if (bbox === null) {
		throw new Error('bbox is required.');
	}
	const [west, south, east, north] = bbox.split(',').map(Number) as [
		number,
		number,
		number,
		number,
	];
	const status = params.get('status');
	const needle = params.get('search')?.toLowerCase() ?? '';
	const serviceRequests = harness.requests.filter(
		(row) =>
			row.lng >= west &&
			row.lng <= east &&
			row.lat >= south &&
			row.lat <= north &&
			(status === null || (status === 'open') === (row.closedAt === null)) &&
			(`#${row.displayName}`.includes(needle) || row.details.toLowerCase().includes(needle)),
	);
	return { serviceRequests, total: serviceRequests.length };
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

let ServiceRequestsExplorer: () => ReactNode;

beforeAll(async () => {
	ServiceRequestsExplorer = await preloadRouteComponent(
		() => import('../../../../../routes/public-engagement/service-requests/index'),
		'service requests',
	);
}, 300_000);

beforeEach(() => {
	// Only `Date`: the rest of the timers stay real so `waitFor` still polls.
	vi.useFakeTimers({ toFake: ['Date'] });
	vi.setSystemTime(new Date('2026-09-15T12:00:00Z'));
	installMemoryCollections();
	seedRows(organizations, [{ id: 'org-1', name: 'Test Mosquito Control', settings: {} }]);
	harness.search = {};
	harness.sent.length = 0;
	harness.extent = null;
	harness.requests = [];
	harness.role = 'admin';
});

afterEach(() => {
	cleanup();
	vi.useRealTimers();
});

function renderServiceRequests() {
	return renderExplorer(ServiceRequestsExplorer);
}

function requestCounts(): { readonly page: number; readonly extent: number } {
	return {
		page: harness.sent.filter((url) => url.pathname === '/map/service-requests').length,
		extent: harness.sent.filter((url) => url.pathname === '/map/tiles/service-requests/extent')
			.length,
	};
}

function pageRequest(): URL | undefined {
	return harness.sent.find((url) => url.pathname === '/map/service-requests');
}

function extentRequest(): URL | undefined {
	return harness.sent.find((url) => url.pathname.endsWith('/extent'));
}

describe('the service requests explorer paging the viewport', () => {
	it('sends the box ahead of this year and lists every request inside it', async () => {
		harness.requests = [INSIDE_OPEN, INSIDE_CLOSED, OUTSIDE];
		harness.extent = { west: 0, south: -1, east: 3, north: 0 };
		renderServiceRequests();

		expect(await screen.findByText('#12')).toBeTruthy();
		// The default status is All, so the closed request inside the box is
		// listed too. The open one outside the box is this Organization's and off
		// screen. The rail used to list it; the map never drew it.
		expect(screen.getByText('#13')).toBeTruthy();
		expect(screen.queryByText('#99')).toBeNull();
		expect(pageRequest()?.search).toBe(
			'?limit=50&offset=0&bbox=0%2C-0.8%2C1%2C0&dateFrom=2026-01-01&dateTo=2026-09-15',
		);
		expect(requestCounts()).toEqual({ page: 1, extent: 1 });
	});

	it('counts what is in view once the panel is collapsed', async () => {
		harness.requests = [INSIDE_OPEN, INSIDE_CLOSED, OUTSIDE];
		harness.search = ALL_TIME;
		harness.extent = { west: 0, south: -1, east: 3, north: 0 };
		renderServiceRequests();

		await screen.findByText('#12');
		expect(screen.getByText('#13')).toBeTruthy();
		// Expanded, the count is the pager's, under the register's noun.
		expect(screen.getByText('2 service requests')).toBeTruthy();

		fireEvent.click(screen.getByRole('button', { name: 'Hide results' }));

		expect(screen.getByText('2 in view')).toBeTruthy();
		expect(screen.queryByText('3 service requests')).toBeNull();
	});

	it('carries the status, search, tag and region as query params the reader takes', async () => {
		harness.search = {
			...ALL_TIME,
			status: 'closed',
			search: '#13',
			tags: 'e1b2c3d4-0000-4000-8000-000000000007',
			regions: 'b1b2c3d4-0000-4000-8000-000000000009',
		};
		harness.requests = [INSIDE_OPEN, INSIDE_CLOSED, OUTSIDE];
		harness.extent = { west: 0, south: -1, east: 1, north: 0 };
		renderServiceRequests();

		expect(await screen.findByText('#13')).toBeTruthy();
		expect(screen.queryByText('#12')).toBeNull();
		expect(pageRequest()?.search).toBe(
			'?limit=50&offset=0&bbox=0%2C-0.8%2C1%2C0&status=closed&search=%2313' +
				'&tagId=e1b2c3d4-0000-4000-8000-000000000007' +
				'&regionId=b1b2c3d4-0000-4000-8000-000000000009',
		);
		// The map's extent request carries the same four filters and no box, so
		// the tiles and the rail are one filtered set framed whole.
		expect(extentRequest()?.search).toBe(
			'?status=closed&search=%2313&tagId=e1b2c3d4-0000-4000-8000-000000000007' +
				'&regionId=b1b2c3d4-0000-4000-8000-000000000009',
		);
	});
});

describe('the service requests explorer with nothing on the page', () => {
	it('spends one extent and one page, with the map and the rail reading the same extent', async () => {
		harness.search = ALL_TIME;
		renderServiceRequests();

		await screen.findByText('No service requests yet');
		expect(requestCounts()).toEqual({ page: 1, extent: 1 });
		expect(extentRequest()?.search).toBe('');
	});

	it('says there are none yet, and where to add one, once every filter is off', async () => {
		harness.search = ALL_TIME;
		renderServiceRequests();

		expect(await screen.findByText('No service requests yet')).toBeTruthy();
		expect(screen.getByText('Create Service Request is in the More actions menu.')).toBeTruthy();
	});

	// The sidebar entry, the header's menu item and the pointer read one string
	// through `createLabel`, so a verb settled once in `CREATE_VERBS` moves all
	// three (#949). Service request is a surface that said `New` on both.
	it('names the create control the way the sidebar and the pointer do', async () => {
		harness.search = ALL_TIME;
		renderServiceRequests();
		await screen.findByText('No service requests yet');

		const names = await createSurfaceNames('/public-engagement/service-requests/create');

		expect(names).toEqual({
			sidebar: 'Create Service Request',
			header: 'Create Service Request',
			pointer: 'Create Service Request is in the More actions menu.',
		});
	});

	it('keeps the pointer from a reader below the floor the control needs', async () => {
		harness.role = 'collector';
		harness.search = ALL_TIME;
		renderServiceRequests();

		expect(await screen.findByText('No service requests yet')).toBeTruthy();
		expect(screen.queryByText('Create Service Request is in the More actions menu.')).toBeNull();
	});

	// The route opens on this year, and the extent it sends says so. A null
	// answer there is about this year, so the rail says the filters did it and
	// opens the card that holds the date control.
	it('reads the default window as a filter and opens the filter card', async () => {
		renderServiceRequests();

		expect(await screen.findByText('No service requests match these filters')).toBeTruthy();
		expect(extentRequest()?.search).toBe('?dateFrom=2026-01-01&dateTo=2026-09-15');
		expect(screen.queryByText('No service requests yet')).toBeNull();

		fireEvent.click(screen.getByRole('button', { name: 'Show filters' }));
		expect(screen.getByRole('button', { name: 'This year' })).toBeTruthy();
	});

	it('offers the reset when a search matches nothing anywhere', async () => {
		harness.search = { ...ALL_TIME, search: 'nowhere' };
		renderServiceRequests();

		expect(await screen.findByText('No service requests match these filters')).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Reset filters' })).toBeTruthy();
	});

	it('says to pan when the extent frames requests the viewport does not hold', async () => {
		harness.requests = [OUTSIDE];
		harness.extent = { west: 1.9, south: -0.5, east: 2.1, north: -0.3 };
		renderServiceRequests();

		expect(await screen.findByText('No service requests in view')).toBeTruthy();
		expect(
			screen.getByText(
				'Pan or zoom the map, or loosen the filters to bring service requests into range.',
			),
		).toBeTruthy();
		await waitFor(() => expect(requestCounts()).toEqual({ page: 1, extent: 1 }));
	});
});
