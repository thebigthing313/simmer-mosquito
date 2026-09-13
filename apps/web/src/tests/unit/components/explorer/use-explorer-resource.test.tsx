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
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MapQueryValue } from '../../../../components/explorer/use-paged-map-resource';
import { cleanupRenderedHooks, createFakeMap } from '../map/fake-map';

/** Every request the hook sent, in order. */
const sent: URL[] = [];
/** What the next response body is, which each test sets for its own shape. */
let answer: (url: URL) => unknown = () => ({});

vi.mock('@simmer-mosquito/sync', async (importOriginal) => ({
	...(await importOriginal<typeof import('@simmer-mosquito/sync')>()),
	sessionFetch: (url: URL) => {
		sent.push(url);
		return Promise.resolve({
			ok: true,
			json: () => Promise.resolve(answer(url)),
		} as Response);
	},
}));

const { useExplorerResource } = await import(
	'../../../../components/explorer/use-explorer-resource'
);

interface Site {
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
});

afterEach(() => {
	cleanupRenderedHooks();
	vi.clearAllMocks();
});

const ids = (prefix: string) => [`${prefix}-1`, `${prefix}-2`];
const DATE_FROM = '2026-01-01';
const DATE_TO = '2026-01-31';

/** One surface as its route calls the hook, with the string it has always sent. */
interface SurfaceCase {
	readonly name: string;
	readonly path: string;
	readonly rowsKey: string;
	readonly rowKey: string;
	readonly label: string;
	readonly params: Readonly<Record<string, MapQueryValue>>;
	readonly search: string;
}

const SURFACES: readonly SurfaceCase[] = [
	{
		name: 'habitats',
		path: '/map/habitats',
		rowsKey: 'habitats',
		rowKey: 'habitat',
		label: 'Habitats',
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
		path: '/map/inspections',
		rowsKey: 'inspections',
		rowKey: 'inspection',
		label: 'Inspections',
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
		path: '/map/samples',
		rowsKey: 'samples',
		rowKey: 'sample',
		label: 'Samples',
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
		path: '/map/collections',
		rowsKey: 'collections',
		rowKey: 'collection',
		label: 'Collections',
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
		path: '/map/traps',
		rowsKey: 'traps',
		rowKey: 'trap',
		label: 'Traps',
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
		path: '/map/biocontrol',
		rowsKey: 'biocontrolActions',
		rowKey: 'biocontrolAction',
		label: 'Biocontrol',
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
		path: '/map/chemical',
		rowsKey: 'applications',
		rowKey: 'application',
		label: 'Applications',
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
		path: '/map/source-reduction',
		rowsKey: 'sourceReductions',
		rowKey: 'sourceReduction',
		label: 'Source reductions',
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
		path: '/map/outreach',
		rowsKey: 'outreachActions',
		rowKey: 'outreachAction',
		label: 'Outreach',
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
					useExplorerResource<Site>({
						path: surface.path,
						rowsKey: surface.rowsKey,
						rowKey: surface.rowKey,
						label: surface.label,
						params: surface.params,
						map: fake.map,
						selectedId: null,
					}),
				{ wrapper },
			);

			await waitFor(() => expect(sent).toHaveLength(1));
			expect(sent[0]?.pathname).toBe(surface.path);
			expect(sent[0]?.search).toBe(surface.search);
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
				useExplorerResource<Site>({
					path: '/map/habitats',
					rowsKey: 'rows',
					rowKey: 'row',
					label: 'Habitats',
					params: { search: 'pond' },
					map,
					selectedId: null,
				}),
			{ wrapper, initialProps: noMapYet },
		);

		// No box yet, so no request. A first page against the whole Organization
		// is the answer this surface must never give.
		await waitFor(() => expect(sent).toHaveLength(0));

		rerender({ map: fake.map });

		await waitFor(() => expect(sent).toHaveLength(1));
		expect(sent[0]?.searchParams.get('bbox')).toBe('0,-0.8,1,0');
	});

	it('listens to the camera on the surfaces that used to page without one', async () => {
		answer = () => ({ rows: [], total: 0 });
		const fake = createFakeMap();

		renderHook(
			() =>
				useExplorerResource<Site>({
					path: '/map/outreach',
					rowsKey: 'rows',
					rowKey: 'row',
					label: 'Outreach',
					params: { technician: ['p-1'] },
					map: fake.map,
					selectedId: null,
				}),
			{ wrapper },
		);

		// One listener, and one request carrying what it read. Outreach put no
		// listener on the camera at all until its server reader landed (#920).
		expect(fake.listenerCount('moveend')).toBe(1);
		await waitFor(() => expect(sent).toHaveLength(1));
		expect(sent[0]?.searchParams.get('bbox')).toBe('0,-0.8,1,0');
	});
});

describe('useExplorerResource: the selected record', () => {
	/*
	 * Worth knowing before reading this one: a by-id request goes out anyway on
	 * the first render, because the page has not arrived yet and a selection the
	 * page does not hold is exactly what that read is for. It is
	 * `useSelectedMapRecord`'s behaviour and predates this hook, so it is left
	 * alone here rather than asserted either way.
	 */
	it('reads a selection off the page it already holds', async () => {
		const onPage = { id: 'row-1', lat: 3, lng: 4 };
		answer = () => ({ rows: [onPage], total: 1 });
		const fake = createFakeMap();

		const { result } = renderHook(
			() =>
				useExplorerResource<Site>({
					path: '/map/outreach',
					rowsKey: 'rows',
					rowKey: 'row',
					label: 'Outreach',
					params: {},
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
	});

	it('fetches a selection the page does not hold, and flies to it', async () => {
		answer = (url) =>
			url.pathname.endsWith('/off-page')
				? { row: { id: 'off-page', lat: 10, lng: 20 } }
				: { rows: [], total: 0 };
		const fake = createFakeMap();

		const { result } = renderHook(
			() =>
				useExplorerResource<Site>({
					path: '/map/outreach',
					rowsKey: 'rows',
					rowKey: 'row',
					label: 'Outreach',
					params: {},
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
				useExplorerResource<Site>({
					path: '/map/chemical',
					rowsKey: 'rows',
					rowKey: 'row',
					label: 'Applications',
					params: {},
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
