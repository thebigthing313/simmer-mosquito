/** @vitest-environment jsdom */

/**
 * The one read behind every paged explorer: a page of a `/map/*` list, the
 * record the map has selected, and the camera move that follows it.
 *
 * The nine query strings below are the load-bearing part. Each was captured off
 * the routes as they stood on `develop` when the hook was written, and is
 * asserted whole rather than key by key: a param renamed, dropped, reordered or
 * newly blank all fail the same way. Six of them gained `bbox` at the front when
 * their server readers landed, which is the one deliberate move these strings
 * have made since (#920).
 *
 * The filter values are fabricated, but every filter each surface has is set, so
 * no key can go missing without a string moving.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { Map as MapboxMap } from 'mapbox-gl';
import { act, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MapTileLayer } from '../../../../components/map/tile-layers';
import type { ExplorerResource } from '../../../../hooks/explorer/use-explorer-resource';
import type { MapQueryValue } from '../../../../hooks/explorer/use-paged-map-resource';
import type { RecordType } from '../../../../lib/record-nouns';
import { cleanupRenderedHooks, createFakeMap, type FakeMap } from '../../components/map/fake-map';

/** Every request the hook sent, in order. */
const sent: URL[] = [];
/**
 * What the next response body is, which each test sets for its own shape. A
 * promise is adopted, which is how a case holds the page open while it counts
 * what went out beside it.
 */
let answer: (url: URL) => unknown = () => ({});
/** Which requests fail. The body is not read on a failure. */
let failing: (url: URL) => boolean = () => false;

vi.mock('@simmer-mosquito/sync', async (importOriginal) => ({
	...(await importOriginal<typeof import('@simmer-mosquito/sync')>()),
	// The page fetch passes a `URL` and the extent fetch a string; both count.
	sessionFetch: (input: URL | string) => {
		const url = input instanceof URL ? input : new URL(input);
		sent.push(url);
		const ok = !failing(url);
		return Promise.resolve({
			ok,
			status: ok ? 200 : 500,
			json: () => Promise.resolve(answer(url)),
		} as Response);
	},
}));

const { useExplorerResource } = await import('../../../../hooks/explorer/use-explorer-resource');
const { tileLayerExtentUrl } = await import('../../../../components/map/tile-layers');
const { useMapExtent } = await import('../../../../hooks/map/use-map-extent');
const { useMapExtentFit } = await import('../../../../hooks/map/use-map-extent-fit');
const { RAIL_HOLDS_MOVE } = await import('../../../../hooks/explorer/use-map-bounds-param');

/**
 * The tile layer each route hands the hook beside its params: the same entry
 * `MapCanvas` frames, whose extent URL is what the empty state reads. Bare, so
 * the extent request carries no filter and the case that wants one says so.
 */
function bareLayer(kind: MapTileLayer['kind']): MapTileLayer {
	return { kind, serverUrl: 'http://api.test' } as MapTileLayer;
}

interface Row {
	readonly id: string;
	readonly lat: number | null;
	readonly lng: number | null;
	readonly quantity?: number;
}

function wrapper({ children }: { readonly children: ReactNode }) {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
	sent.length = 0;
	answer = () => ({});
	failing = () => false;
});

afterEach(() => {
	cleanupRenderedHooks();
	vi.clearAllMocks();
});

const ids = (prefix: string) => [`${prefix}-1`, `${prefix}-2`];

/** The page requests so far, which is what every query-string case reads. */
function pageRequests(path: string): readonly URL[] {
	return sent.filter((url) => url.pathname === path);
}

/** The extent requests so far. A tileset's extent path is under `/map/tiles/`. */
function extentRequests(): readonly URL[] {
	return sent.filter((url) => url.pathname.endsWith('/extent'));
}

/**
 * How many of the requests so far were the page, how many a record by id, and
 * how many the extent the rail reads its empty state off.
 */
function requestCounts(path: string): {
	readonly page: number;
	readonly byId: number;
	readonly extent: number;
} {
	let page = 0;
	let byId = 0;
	for (const url of sent) {
		if (url.pathname === path) {
			page += 1;
		} else if (url.pathname.startsWith(`${path}/`)) {
			byId += 1;
		}
	}
	return { page, byId, extent: extentRequests().length };
}

/** A page answer a case releases by hand, so it can look at what went out beside it. */
function deferred<T>(): { readonly promise: Promise<T>; readonly resolve: (value: T) => void } {
	let resolve: (value: T) => void = () => undefined;
	const promise = new Promise<T>((settle) => {
		resolve = settle;
	});
	return { promise, resolve };
}

const DATE_FROM = '2026-01-01';
const DATE_TO = '2026-01-31';

/** One surface as its route calls the hook, with the string it has always sent. */
interface SurfaceCase {
	readonly name: string;
	readonly path: string;
	readonly rowsKey: string;
	readonly rowKey: string;
	readonly recordType: RecordType;
	readonly params: Readonly<Record<string, MapQueryValue>>;
	readonly search: string;
	/** The tileset the route draws, whose extent the empty state reads. */
	readonly kind: MapTileLayer['kind'];
}

const SURFACES: readonly SurfaceCase[] = [
	{
		name: 'habitats',
		kind: 'habitats',
		path: '/map/habitats',
		rowsKey: 'habitats',
		rowKey: 'habitat',
		recordType: 'habitat',
		params: {
			isActive: true,
			isInaccessible: false,
			habitatTypeId: ids('type'),
			tagId: ids('tag'),
			regionId: ids('region'),
			search: 'pond',
		},
		search:
			'?limit=50&offset=0&bbox=0%2C-0.8%2C1%2C0&isActive=true&isInaccessible=false&habitatTypeId=type-1%2Ctype-2&tagId=tag-1%2Ctag-2&regionId=region-1%2Cregion-2&search=pond',
	},
	{
		name: 'inspections',
		kind: 'inspections',
		path: '/map/inspections',
		rowsKey: 'inspections',
		rowKey: 'inspection',
		recordType: 'inspection',
		params: {
			isWet: false,
			density: ['low', 'high'],
			positive: true,
			habitatTypeId: ids('type'),
			inspectedBy: ids('person'),
			regionId: ids('region'),
			dateFrom: DATE_FROM,
			dateTo: DATE_TO,
		},
		search:
			'?limit=50&offset=0&bbox=0%2C-0.8%2C1%2C0&isWet=false&density=low%2Chigh&positive=true&habitatTypeId=type-1%2Ctype-2&inspectedBy=person-1%2Cperson-2&regionId=region-1%2Cregion-2&dateFrom=2026-01-01&dateTo=2026-01-31',
	},
	{
		name: 'samples',
		kind: 'samples',
		path: '/map/samples',
		rowsKey: 'samples',
		rowKey: 'sample',
		recordType: 'sample',
		params: {
			species: ids('species'),
			status: 'identified',
			nonMosquito: true,
			regionId: ids('region'),
			dateFrom: DATE_FROM,
			dateTo: DATE_TO,
		},
		search:
			'?limit=50&offset=0&bbox=0%2C-0.8%2C1%2C0&species=species-1%2Cspecies-2&status=identified&nonMosquito=true&regionId=region-1%2Cregion-2&dateFrom=2026-01-01&dateTo=2026-01-31',
	},
	{
		name: 'collections',
		kind: 'collections',
		path: '/map/collections',
		rowsKey: 'collections',
		rowKey: 'collection',
		recordType: 'collection',
		params: {
			collectionMethodId: ids('method'),
			problem: true,
			regionId: ids('region'),
			dateFrom: DATE_FROM,
			dateTo: DATE_TO,
		},
		search:
			'?limit=50&offset=0&bbox=0%2C-0.8%2C1%2C0&collectionMethodId=method-1%2Cmethod-2&problem=true&regionId=region-1%2Cregion-2&dateFrom=2026-01-01&dateTo=2026-01-31',
	},
	{
		name: 'traps',
		kind: 'traps',
		path: '/map/traps',
		rowsKey: 'traps',
		rowKey: 'trap',
		recordType: 'trap',
		params: {
			collectionMethodId: ids('method'),
			status: 'active',
			search: 'gravid',
			regionId: ids('region'),
		},
		search:
			'?limit=50&offset=0&bbox=0%2C-0.8%2C1%2C0&collectionMethodId=method-1%2Cmethod-2&status=active&search=gravid&regionId=region-1%2Cregion-2',
	},
	{
		name: 'biocontrol',
		kind: 'biocontrol',
		path: '/map/biocontrol',
		rowsKey: 'biocontrolActions',
		rowKey: 'biocontrolAction',
		recordType: 'biocontrolAction',
		params: {
			biocontrolMethodId: ids('method'),
			technician: ids('person'),
			regionId: ids('region'),
			habitatLinked: true,
			dateFrom: DATE_FROM,
			dateTo: DATE_TO,
		},
		search:
			'?limit=50&offset=0&bbox=0%2C-0.8%2C1%2C0&biocontrolMethodId=method-1%2Cmethod-2&technician=person-1%2Cperson-2&regionId=region-1%2Cregion-2&habitatLinked=true&dateFrom=2026-01-01&dateTo=2026-01-31',
	},
	{
		name: 'chemical',
		kind: 'chemical',
		path: '/map/chemical',
		rowsKey: 'applications',
		rowKey: 'application',
		recordType: 'application',
		params: {
			insecticideId: ids('product'),
			applicationMethodId: ids('method'),
			applicator: ids('person'),
			regionId: ids('region'),
			dateFrom: DATE_FROM,
			dateTo: DATE_TO,
		},
		search:
			'?limit=50&offset=0&bbox=0%2C-0.8%2C1%2C0&insecticideId=product-1%2Cproduct-2&applicationMethodId=method-1%2Cmethod-2&applicator=person-1%2Cperson-2&regionId=region-1%2Cregion-2&dateFrom=2026-01-01&dateTo=2026-01-31',
	},
	{
		name: 'source reduction',
		kind: 'source-reduction',
		path: '/map/source-reduction',
		rowsKey: 'sourceReductions',
		rowKey: 'sourceReduction',
		recordType: 'sourceReduction',
		params: {
			sourceReductionMethodId: ids('method'),
			technician: ids('person'),
			regionId: ids('region'),
			dateFrom: DATE_FROM,
			dateTo: DATE_TO,
		},
		search:
			'?limit=50&offset=0&bbox=0%2C-0.8%2C1%2C0&sourceReductionMethodId=method-1%2Cmethod-2&technician=person-1%2Cperson-2&regionId=region-1%2Cregion-2&dateFrom=2026-01-01&dateTo=2026-01-31',
	},
	{
		name: 'outreach',
		kind: 'outreach',
		path: '/map/outreach',
		rowsKey: 'outreachActions',
		rowKey: 'outreachAction',
		recordType: 'outreachAction',
		params: {
			outreachMethodId: ids('method'),
			technician: ids('person'),
			regionId: ids('region'),
			dateFrom: DATE_FROM,
			dateTo: DATE_TO,
		},
		search:
			'?limit=50&offset=0&bbox=0%2C-0.8%2C1%2C0&outreachMethodId=method-1%2Cmethod-2&technician=person-1%2Cperson-2&regionId=region-1%2Cregion-2&dateFrom=2026-01-01&dateTo=2026-01-31',
	},
];

describe('useExplorerResource: what each surface sends', () => {
	for (const surface of SURFACES) {
		it(`sends the ${surface.name} query string unchanged`, async () => {
			const fake = createFakeMap();
			answer = () => ({ [surface.rowsKey]: [], total: 0 });

			renderHook(
				() =>
					useExplorerResource<Row>({
						path: surface.path,
						rowsKey: surface.rowsKey,
						rowKey: surface.rowKey,
						recordType: surface.recordType,
						params: surface.params,
						layer: bareLayer(surface.kind),
						map: fake.map,
						selectedId: null,
					}),
				{ wrapper },
			);

			await waitFor(() => expect(pageRequests(surface.path)).toHaveLength(1));
			expect(pageRequests(surface.path)[0]?.search).toBe(surface.search);
		});
	}

	// The rail is the map's list on every one of them, so the box is not a
	// per-surface fact any more. Asserted over the table rather than inside each
	// case, because what this is about is that no surface is missing one (#920).
	it('sends bbox on all nine', () => {
		expect(SURFACES).toHaveLength(9);
		for (const surface of SURFACES) {
			expect(surface.search.includes(`bbox=`)).toBe(true);
		}
	});
});

describe('useExplorerResource: the viewport', () => {
	it('asks for nothing until the map has one', async () => {
		answer = () => ({ rows: [], total: 0 });
		const fake = createFakeMap();
		// Declared rather than written inline, so the rerender below is typed as a
		// map arriving rather than as a second `null`.
		const noMapYet: { readonly map: MapboxMap | null } = { map: null };

		const { rerender } = renderHook(
			({ map }: { readonly map: MapboxMap | null }) =>
				useExplorerResource<Row>({
					path: '/map/habitats',
					rowsKey: 'rows',
					rowKey: 'row',
					recordType: 'habitat',
					params: { search: 'pond' },
					layer: bareLayer('habitats'),
					map,
					selectedId: null,
				}),
			{ wrapper, initialProps: noMapYet },
		);

		// No box yet, so no page. A first page against the whole Organization is
		// the answer this surface must never give. The extent is not bounded and
		// goes out now, as it did from the map before the rail read it (#958).
		await waitFor(() => expect(extentRequests()).toHaveLength(1));
		expect(pageRequests('/map/habitats')).toHaveLength(0);

		rerender({ map: fake.map });

		await waitFor(() => expect(pageRequests('/map/habitats')).toHaveLength(1));
		expect(pageRequests('/map/habitats')[0]?.searchParams.get('bbox')).toBe('0,-0.8,1,0');
	});

	it('listens to the camera on the surfaces that used to page without one', async () => {
		answer = () => ({ rows: [], total: 0 });
		const fake = createFakeMap();

		renderHook(
			() =>
				useExplorerResource<Row>({
					path: '/map/outreach',
					rowsKey: 'rows',
					rowKey: 'row',
					recordType: 'outreachAction',
					params: { technician: ['p-1'] },
					layer: bareLayer('outreach'),
					map: fake.map,
					selectedId: null,
				}),
			{ wrapper },
		);

		// One listener, and one request carrying what it read. Outreach put no
		// listener on the camera at all until its server reader landed (#920).
		expect(fake.listenerCount('moveend')).toBe(1);
		await waitFor(() => expect(pageRequests('/map/outreach')).toHaveLength(1));
		expect(pageRequests('/map/outreach')[0]?.searchParams.get('bbox')).toBe('0,-0.8,1,0');
	});
});

describe('useExplorerResource: the selected record', () => {
	/*
	 * The rule these cases hold, stated in `useSelectedMapRecord`'s docblock: a
	 * record is asked for by id only once the page has answered and does not hold
	 * it. Before #934 the by-id request went out on the first render beside the
	 * page request, because `rows` is empty until the page lands and an empty
	 * page cannot hold anything, so every deep link whose row was on the page
	 * spent a round trip on a row the page was about to deliver.
	 */
	it('reads a selection off the page it already holds', async () => {
		const onPage = { id: 'row-1', lat: 3, lng: 4 };
		answer = () => ({ rows: [onPage], total: 1 });
		const fake = createFakeMap();

		const { result } = renderHook(
			() =>
				useExplorerResource<Row>({
					path: '/map/outreach',
					rowsKey: 'rows',
					rowKey: 'row',
					recordType: 'outreachAction',
					params: {},
					layer: bareLayer('outreach'),
					map: fake.map,
					selectedId: 'row-1',
				}),
			{ wrapper },
		);

		await waitFor(() => expect(result.current.selected).toEqual(onPage));
		// The page is what answered: `selected` is the row object out of `rows`
		// rather than anything a second request built.
		expect(result.current.selected).toBe(result.current.rows[0]);
		await waitFor(() => expect(fake.cameraCalls).toHaveLength(1));
		expect(fake.cameraCalls[0]?.kind).toBe('flyTo');
		// No `holdRailOnSelect`, so the flight is an ordinary move the rail follows.
		expect(fake.cameraCalls[0]?.eventData).toBeUndefined();
	});

	it('marks the flight to a selection so the rail keeps its rows', async () => {
		const onPage = { id: 'row-1', lat: 3, lng: 4 };
		answer = () => ({ rows: [onPage], total: 1 });
		const fake = createFakeMap();

		renderHook(
			() =>
				useExplorerResource<Row>({
					path: '/map/service-requests',
					rowsKey: 'rows',
					rowKey: 'row',
					recordType: 'serviceRequest',
					params: {},
					layer: bareLayer('service-requests'),
					map: fake.map,
					selectedId: 'row-1',
					holdRailOnSelect: true,
				}),
			{ wrapper },
		);

		await waitFor(() => expect(fake.cameraCalls).toHaveLength(1));
		expect(fake.cameraCalls[0]?.eventData).toEqual({ [RAIL_HOLDS_MOVE]: true });
	});

	it('spends one request on a deep link whose row is on the page', async () => {
		const onPage = { id: 'row-1', lat: 3, lng: 4 };
		answer = () => ({ rows: [onPage], total: 1 });
		const fake = createFakeMap();

		const { result } = renderHook(
			() =>
				useExplorerResource<Row>({
					path: '/map/outreach',
					rowsKey: 'rows',
					rowKey: 'row',
					recordType: 'outreachAction',
					params: {},
					layer: bareLayer('outreach'),
					map: fake.map,
					selectedId: 'row-1',
				}),
			{ wrapper },
		);

		await waitFor(() => expect(result.current.selected).toEqual(onPage));
		// Settled, so anything the hook was going to send has been sent.
		await waitFor(() => expect(result.current.isSettled).toBe(true));
		expect(requestCounts('/map/outreach')).toEqual({ page: 1, byId: 0, extent: 1 });
	});

	it('asks for a row the page does not hold once the page has answered', async () => {
		const page = deferred<{ rows: readonly Row[]; total: number }>();
		answer = (url) =>
			url.pathname.endsWith('/off-page')
				? { row: { id: 'off-page', lat: 10, lng: 20 } }
				: page.promise;
		const fake = createFakeMap();

		const { result } = renderHook(
			() =>
				useExplorerResource<Row>({
					path: '/map/outreach',
					rowsKey: 'rows',
					rowKey: 'row',
					recordType: 'outreachAction',
					params: {},
					layer: bareLayer('outreach'),
					map: fake.map,
					selectedId: 'off-page',
				}),
			{ wrapper },
		);

		// The page is still open, and nothing has gone out beside it.
		await waitFor(() => expect(requestCounts('/map/outreach').page).toBe(1));
		expect(requestCounts('/map/outreach')).toEqual({ page: 1, byId: 0, extent: 1 });
		expect(result.current.selected).toBeNull();

		page.resolve({ rows: [{ id: 'row-1', lat: 1, lng: 2 }], total: 1 });

		await waitFor(() => expect(result.current.selected?.id).toBe('off-page'));
		expect(requestCounts('/map/outreach')).toEqual({ page: 1, byId: 1, extent: 1 });
		expect(
			sent.map((url) => url.pathname).filter((pathname) => pathname.startsWith('/map/outreach')),
		).toEqual(['/map/outreach', '/map/outreach/off-page']);
	});

	// A page with no rows is an answer, and it does not hold the selection. The
	// gate is on the page having settled and never on it holding something, or a
	// deep link into an empty viewport would draw no rail at all.
	it('asks for the row when the page legitimately holds nothing', async () => {
		answer = (url) =>
			url.pathname.endsWith('/off-page')
				? { row: { id: 'off-page', lat: 10, lng: 20 } }
				: { rows: [], total: 0 };
		const fake = createFakeMap();

		const { result } = renderHook(
			() =>
				useExplorerResource<Row>({
					path: '/map/outreach',
					rowsKey: 'rows',
					rowKey: 'row',
					recordType: 'outreachAction',
					params: {},
					layer: bareLayer('outreach'),
					map: fake.map,
					selectedId: 'off-page',
				}),
			{ wrapper },
		);

		await waitFor(() => expect(result.current.selected?.id).toBe('off-page'));
		expect(result.current.rows).toHaveLength(0);
		expect(requestCounts('/map/outreach')).toEqual({ page: 1, byId: 1, extent: 1 });
	});

	// An error settles the page too. The rail can draw when the list cannot.
	it('asks for the row when the page request failed', async () => {
		failing = (url) => url.pathname === '/map/outreach';
		answer = () => ({ row: { id: 'off-page', lat: 10, lng: 20 } });
		const fake = createFakeMap();

		const { result } = renderHook(
			() =>
				useExplorerResource<Row>({
					path: '/map/outreach',
					rowsKey: 'rows',
					rowKey: 'row',
					recordType: 'outreachAction',
					params: {},
					layer: bareLayer('outreach'),
					map: fake.map,
					selectedId: 'off-page',
				}),
			{ wrapper },
		);

		await waitFor(() => expect(result.current.isError).toBe(true));
		await waitFor(() => expect(result.current.selected?.id).toBe('off-page'));
		expect(requestCounts('/map/outreach')).toEqual({ page: 1, byId: 1, extent: 1 });
	});

	it('fetches a selection the page does not hold, and flies to it', async () => {
		answer = (url) =>
			url.pathname.endsWith('/off-page')
				? { row: { id: 'off-page', lat: 10, lng: 20 } }
				: { rows: [], total: 0 };
		const fake = createFakeMap();

		const { result } = renderHook(
			() =>
				useExplorerResource<Row>({
					path: '/map/outreach',
					rowsKey: 'rows',
					rowKey: 'row',
					recordType: 'outreachAction',
					params: {},
					layer: bareLayer('outreach'),
					map: fake.map,
					selectedId: 'off-page',
				}),
			{ wrapper },
		);

		await waitFor(() => expect(result.current.selected?.id).toBe('off-page'));
		expect(sent.map((url) => url.pathname)).toContain('/map/outreach/off-page');
		await waitFor(() => expect(fake.cameraCalls).toHaveLength(1));
	});

	it('shapes the page and the fetched record through one normalizer', async () => {
		answer = (url) =>
			url.pathname.endsWith('/off-page')
				? { row: { id: 'off-page', lat: 10, lng: 20 } }
				: { rows: [{ id: 'row-1', lat: 1, lng: 2 }], total: 1 };
		const fake = createFakeMap();

		const { result } = renderHook(
			() =>
				useExplorerResource<Row>({
					path: '/map/chemical',
					rowsKey: 'rows',
					rowKey: 'row',
					recordType: 'application',
					params: {},
					layer: bareLayer('chemical'),
					map: fake.map,
					selectedId: 'off-page',
					// What a deployed server that predates the column leaves out.
					normalizeRow: (row) => ({ quantity: 0, ...row }),
				}),
			{ wrapper },
		);

		await waitFor(() => expect(result.current.rows).toHaveLength(1));
		expect(result.current.rows[0]?.quantity).toBe(0);
		await waitFor(() => expect(result.current.selected?.quantity).toBe(0));
	});
});

describe('useExplorerResource: why the rail is empty', () => {
	/*
	 * The extent the map fetches to frame its data is what settles the empty
	 * state: a box means matches exist somewhere and the viewport is what to
	 * change, null means nothing matched anywhere, and then the extent URL's own
	 * query string says whether a filter did it (#958). None of it is a second
	 * request, which the first case counts.
	 */
	const BOX = { west: -1, south: -1, east: 1, north: 1 };

	function withExtent(extent: unknown, rows: readonly Row[] = []) {
		answer = (url) =>
			url.pathname.endsWith('/extent') ? { extent } : { rows, total: rows.length };
	}

	/** The layer a first-run habitats route draws: nothing narrowed. */
	const UNFILTERED: MapTileLayer = bareLayer('habitats');
	/** The same layer with a search term, so the extent request carries a filter. */
	const FILTERED: MapTileLayer = {
		kind: 'habitats',
		serverUrl: 'http://api.test',
		filters: { search: 'pond' },
	};

	function renderRail(layer: MapTileLayer, map: MapboxMap | null) {
		return renderHook(
			() => ({
				rail: useExplorerResource<Row>({
					path: '/map/habitats',
					rowsKey: 'rows',
					rowKey: 'row',
					recordType: 'habitat',
					params: {},
					layer,
					map,
					selectedId: null,
				}),
				// What `MapCanvas` runs under `fitToData`: the same extent, observed a
				// second time. One request between the two is the whole point.
				fit: useMapExtent(tileLayerExtentUrl(layer)),
			}),
			{ wrapper },
		);
	}

	it('spends one extent and one page on a first-run surface, with the map framing the same extent', async () => {
		withExtent(null);
		const fake = createFakeMap();

		const { result } = renderRail(UNFILTERED, fake.map);

		await waitFor(() => expect(result.current.rail.empty.reason).toBe('none'));
		await waitFor(() => expect(result.current.rail.isSettled).toBe(true));
		expect(result.current.fit.isSettled).toBe(true);
		expect(requestCounts('/map/habitats')).toEqual({ page: 1, byId: 0, extent: 1 });
		// The extent asks for the whole filtered set, never the viewport.
		expect(extentRequests()[0]?.pathname).toBe('/map/tiles/habitats/extent');
		expect(extentRequests()[0]?.search).toBe('');
	});

	it('reads an empty page under a framed extent as the viewport', async () => {
		withExtent(BOX);
		const fake = createFakeMap();

		const { result } = renderRail(UNFILTERED, fake.map);

		await waitFor(() => expect(result.current.rail.isSettled).toBe(true));
		expect(result.current.rail.rows).toHaveLength(0);
		expect(result.current.rail.empty).toEqual({ recordType: 'habitat', reason: 'viewport' });
		expect(result.current.rail.isLoading).toBe(false);
	});

	it('reads a null extent under a filter as nothing matching the filters', async () => {
		withExtent(null);
		const fake = createFakeMap();

		const { result } = renderRail(FILTERED, fake.map);

		await waitFor(() => expect(result.current.rail.empty.reason).toBe('filters'));
		expect(extentRequests()[0]?.search).toBe('?search=pond');
		expect(requestCounts('/map/habitats')).toEqual({ page: 1, byId: 0, extent: 1 });
	});

	it('reads a null extent with no filter as the Organization having none yet', async () => {
		withExtent(null);
		const fake = createFakeMap();

		const { result } = renderRail(UNFILTERED, fake.map);

		await waitFor(() => expect(result.current.rail.empty.reason).toBe('none'));
		expect(result.current.rail.isLoading).toBe(false);
	});

	// The rail cannot say which of the three it is until the extent has answered,
	// so it reports loading and the placeholders stay up.
	it('reports loading, and the loading reason, while the extent is in flight', async () => {
		const extent = deferred<{ extent: null }>();
		answer = (url) => (url.pathname.endsWith('/extent') ? extent.promise : { rows: [], total: 0 });
		const fake = createFakeMap();

		const { result } = renderRail(UNFILTERED, fake.map);

		await waitFor(() => expect(result.current.rail.isSettled).toBe(true));
		expect(result.current.rail.isLoading).toBe(true);
		expect(result.current.rail.empty.reason).toBe('loading');

		extent.resolve({ extent: null });

		await waitFor(() => expect(result.current.rail.empty.reason).toBe('none'));
		expect(result.current.rail.isLoading).toBe(false);
	});

	// The page query waits for the map's viewport, and a waiting query is not a
	// loading one to React Query. A cold map read as an empty, settled page and
	// the rail said "No habitats in view" for as long as the map took to load.
	it('reports loading while the map has not reported a viewport', async () => {
		withExtent(BOX);

		const { result } = renderRail(UNFILTERED, null);

		await waitFor(() => expect(requestCounts('/map/habitats').extent).toBe(1));
		expect(result.current.rail.isLoading).toBe(true);
		expect(result.current.rail.empty.reason).toBe('loading');
		expect(requestCounts('/map/habitats').page).toBe(0);
	});

	// A failed extent settles nothing about the set, so the rail says what it
	// said before it could tell: pan or zoom.
	it('falls back to the viewport copy when the extent request fails', async () => {
		failing = (url) => url.pathname.endsWith('/extent');
		answer = () => ({ rows: [], total: 0 });
		const fake = createFakeMap();

		const { result } = renderRail(UNFILTERED, fake.map);

		await waitFor(() => expect(result.current.rail.isSettled).toBe(true));
		await waitFor(() => expect(result.current.rail.isLoading).toBe(false));
		expect(result.current.rail.empty.reason).toBe('viewport');
	});
});

describe('useExplorerResource: a filter change', () => {
	/*
	 * What one filter change costs, with the canvas's fit running beside the
	 * rail the way `MapCanvas` runs it. The fake map's `fitBounds` moves nothing
	 * and fires no `moveend`, so each case fires the move by hand with `moveTo`
	 * where the real animation would end, and asserts what went out before and
	 * after it. That is the seam the sequence turns on: a fit moves the camera,
	 * the move changes the box, and the box keys the page (#957).
	 */

	/** A layer carrying the surface's filters, so its extent URL changes with them. */
	function layerFor(search: string): MapTileLayer {
		return search === ''
			? bareLayer('habitats')
			: { kind: 'habitats', serverUrl: 'http://api.test', filters: { search } };
	}

	/** Answer each extent request from a table keyed by the search it carries. */
	function serveExtents(extents: Readonly<Record<string, unknown>>) {
		answer = (url) =>
			url.pathname.endsWith('/extent')
				? { extent: extents[url.searchParams.get('search') ?? ''] ?? null }
				: { rows: [], total: 0 };
	}

	function renderExplorer(fake: FakeMap) {
		return renderHook(
			({ search }: { readonly search: string }) => {
				const layer = layerFor(search);
				const rail = useExplorerResource<Row>({
					path: '/map/habitats',
					rowsKey: 'rows',
					rowKey: 'row',
					recordType: 'habitat',
					params: { search },
					layer,
					map: fake.map,
					selectedId: null,
				});
				// The canvas's half: the same extent, and the camera move it decides.
				useMapExtentFit(fake.map, true, { url: tileLayerExtentUrl(layer) ?? '' });
				return rail;
			},
			{ wrapper, initialProps: { search: '' } },
		);
	}

	/** The page requests so far, as the box each one asked about. */
	function pageBoxes(): readonly (string | null)[] {
		return pageRequests('/map/habitats').map((url) => url.searchParams.get('bbox'));
	}

	/**
	 * The fake map answers `getBounds` at the origin with the padded strip west
	 * 0.2, south -0.8, east 0.4, north 0. One extent sits wholly inside it, the
	 * other has a corner past its east edge.
	 */
	const INSIDE = { west: 0.25, south: -0.5, east: 0.35, north: -0.1 };
	const OUTSIDE = { west: 0.3, south: -0.5, east: 0.6, north: -0.1 };

	/**
	 * Load the surface and let its first fit land: the page against the map's
	 * opening camera, the extent, the fit, the move, and the page against the
	 * box the move produced. Then bring the camera back to the origin, so every
	 * case starts from the same view, and wait for that page too.
	 */
	async function loadAndFrame(
		fake: FakeMap,
		result: { readonly current: ExplorerResource<Row> },
	): Promise<void> {
		await waitFor(() =>
			expect(requestCounts('/map/habitats')).toEqual({ page: 1, byId: 0, extent: 1 }),
		);
		await waitFor(() => expect(fake.cameraCalls).toHaveLength(1));
		expect(fake.cameraCalls[0]?.kind).toBe('fitBounds');
		expect(pageBoxes()).toEqual(['0,-0.8,1,0']);
		act(() => {
			fake.moveTo(1, 1);
		});
		await waitFor(() => expect(pageBoxes()).toEqual(['0,-0.8,1,0', '1,0.2,2,1']));
		act(() => {
			fake.moveTo(0, 0);
		});
		await waitFor(() => expect(pageBoxes()).toHaveLength(3));
		await waitFor(() => expect(result.current.isSettled).toBe(true));
	}

	it('frames the data on load, whichever side of the view it is on', async () => {
		serveExtents({ '': INSIDE });
		const fake = createFakeMap();

		const { result } = renderExplorer(fake);

		// The load-time fit is unconditional: a fresh map always frames its data,
		// and the page that follows the move is the one the rail keeps.
		await loadAndFrame(fake, result);
		expect(fake.cameraCalls).toHaveLength(1);
	});

	it('spends one page request, and no camera move, on a change whose extent is already in view', async () => {
		serveExtents({ '': OUTSIDE, pond: INSIDE });
		const fake = createFakeMap();
		const { result, rerender } = renderExplorer(fake);
		await loadAndFrame(fake, result);
		const before = requestCounts('/map/habitats');

		rerender({ search: 'pond' });

		await waitFor(() => expect(requestCounts('/map/habitats').extent).toBe(before.extent + 1));
		await waitFor(() => expect(result.current.isLoading).toBe(false));
		await waitFor(() => expect(result.current.isSettled).toBe(true));
		// One extent, one page against the box the person is already looking at,
		// and the camera left where it was: every match is on screen.
		expect(requestCounts('/map/habitats')).toEqual({
			page: before.page + 1,
			byId: 0,
			extent: before.extent + 1,
		});
		expect(fake.cameraCalls).toHaveLength(1);
		expect(pageRequests('/map/habitats').at(-1)?.searchParams.get('search')).toBe('pond');
	});

	it('fits, and pages again after the move, on a change whose extent is partly off screen', async () => {
		serveExtents({ '': INSIDE, pond: OUTSIDE });
		const fake = createFakeMap();
		const { result, rerender } = renderExplorer(fake);
		await loadAndFrame(fake, result);
		const before = requestCounts('/map/habitats');

		rerender({ search: 'pond' });

		// The page against the old box goes out beside the extent, and the fit
		// follows the extent's answer.
		await waitFor(() => expect(fake.cameraCalls).toHaveLength(2));
		expect(fake.cameraCalls[1]?.kind).toBe('fitBounds');
		expect(requestCounts('/map/habitats')).toEqual({
			page: before.page + 1,
			byId: 0,
			extent: before.extent + 1,
		});
		expect(pageBoxes().at(-1)).toBe('0,-0.8,1,0');

		// The move lands, and the page against the box it produced follows.
		act(() => {
			fake.moveTo(0.3, 0);
		});
		await waitFor(() => expect(requestCounts('/map/habitats').page).toBe(before.page + 2));
		expect(pageBoxes().at(-1)).toBe('0.3,-0.8,1.3,0');
		expect(pageRequests('/map/habitats').at(-1)?.searchParams.get('search')).toBe('pond');
		await waitFor(() => expect(result.current.isSettled).toBe(true));
		expect(fake.cameraCalls).toHaveLength(2);
	});

	it('leaves the camera alone when nothing matches, and the rail says why', async () => {
		serveExtents({ '': INSIDE, pond: null });
		const fake = createFakeMap();
		const { result, rerender } = renderExplorer(fake);
		await loadAndFrame(fake, result);
		const before = requestCounts('/map/habitats');

		rerender({ search: 'pond' });

		await waitFor(() => expect(result.current.empty.reason).toBe('filters'));
		await waitFor(() => expect(result.current.isSettled).toBe(true));
		expect(requestCounts('/map/habitats')).toEqual({
			page: before.page + 1,
			byId: 0,
			extent: before.extent + 1,
		});
		expect(fake.cameraCalls).toHaveLength(1);
	});

	it('reads an extent on the far side of the antimeridian as in view', async () => {
		// A view unwrapped past the line, 180.1 to 180.3 east, which is how mapbox
		// reports a camera there, and an extent the server writes at -179.8,
		// which is the same ground.
		serveExtents({ '': INSIDE, pond: { west: -179.8, south: -0.5, east: -179.75, north: -0.1 } });
		const fake = createFakeMap();
		const { result, rerender } = renderExplorer(fake);
		await loadAndFrame(fake, result);
		act(() => {
			fake.moveTo(179.9, 0);
		});
		await waitFor(() => expect(result.current.isSettled).toBe(true));
		const before = requestCounts('/map/habitats');

		rerender({ search: 'pond' });

		await waitFor(() => expect(requestCounts('/map/habitats').extent).toBe(before.extent + 1));
		await waitFor(() => expect(result.current.isLoading).toBe(false));
		await waitFor(() => expect(result.current.isSettled).toBe(true));
		expect(fake.cameraCalls).toHaveLength(1);
		expect(requestCounts('/map/habitats').page).toBe(before.page + 1);
	});
});
