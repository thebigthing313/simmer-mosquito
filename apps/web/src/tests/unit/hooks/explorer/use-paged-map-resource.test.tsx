/** @vitest-environment jsdom */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { type ReactNode, useLayoutEffect } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The paging state around one `/map/*` list request: a new request starts at
 * the first page, and a row count that shrinks under the current page clamps
 * it. Both used to be effects, and each committed one render with the wrong
 * page before the one with the right page, so every committed render's page is
 * recorded, from a layout effect so a render React throws away before commit
 * is not in the list, and the assertions read the list (#1184).
 */

/** How many rows the fake endpoint holds, which a case lowers to model a delete. */
let total = 120;

vi.mock('@simmer-mosquito/sync', async (importOriginal) => ({
	...(await importOriginal<typeof import('@simmer-mosquito/sync')>()),
	sessionFetch: (url: URL) => {
		const offset = Number(url.searchParams.get('offset'));
		const limit = Number(url.searchParams.get('limit'));
		const rows = Array.from({ length: Math.max(0, Math.min(limit, total - offset)) }, (_, i) => ({
			id: `row-${offset + i}`,
		}));
		return Promise.resolve(new Response(JSON.stringify({ rows, total }), { status: 200 }));
	},
}));

const { mapQueryParams, usePagedMapResource } = await import(
	'../../../../hooks/explorer/use-paged-map-resource'
);

const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

function wrapper({ children }: { readonly children: ReactNode }) {
	return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function renderPaged(initialParams: Readonly<Record<string, string>>) {
	const pages: { readonly page: number; readonly pageCount: number }[] = [];
	const rendered = renderHook(
		({ params }: { readonly params: Readonly<Record<string, string>> }) => {
			const resource = usePagedMapResource<{ readonly id: string }>({
				path: '/map/habitats',
				rowsKey: 'rows',
				recordType: 'habitat',
				params,
			});
			const { page, pageCount } = resource;
			useLayoutEffect(() => {
				pages.push({ page, pageCount });
			});
			return resource;
		},
		{ initialProps: { params: initialParams }, wrapper },
	);
	return { ...rendered, pages };
}

beforeEach(() => {
	total = 120;
	client.clear();
});

describe('the page of a list request', () => {
	it('turns, and asks for the rows at that offset', async () => {
		const paged = renderPaged({ status: 'active' });
		await waitFor(() => expect(paged.result.current.isSettled).toBe(true));
		expect(paged.result.current.pageCount).toBe(3);
		expect(paged.result.current.rows[0]?.id).toBe('row-0');

		act(() => paged.result.current.setPage(2));
		await waitFor(() => expect(paged.result.current.rows[0]?.id).toBe('row-100'));
		expect(paged.result.current.rows).toHaveLength(20);
	});

	it('is the first page under a new request in the render that sees it', async () => {
		const paged = renderPaged({ status: 'active' });
		await waitFor(() => expect(paged.result.current.isSettled).toBe(true));
		act(() => paged.result.current.setPage(2));
		await waitFor(() => expect(paged.result.current.rows[0]?.id).toBe('row-100'));
		paged.pages.length = 0;

		paged.rerender({ params: { status: 'retired' } });
		expect(paged.pages.map((frame) => frame.page)).toEqual([0]);
		await waitFor(() => expect(paged.result.current.rows[0]?.id).toBe('row-0'));
	});

	it('clamps to the new last page when the rows shrink under it, with no empty page drawn', async () => {
		const paged = renderPaged({ status: 'active' });
		await waitFor(() => expect(paged.result.current.isSettled).toBe(true));
		act(() => paged.result.current.setPage(2));
		await waitFor(() => expect(paged.result.current.rows[0]?.id).toBe('row-100'));

		// The last page's rows are deleted and the list is read again.
		total = 100;
		paged.pages.length = 0;
		await act(() => client.invalidateQueries());
		await waitFor(() => expect(paged.result.current.rows[0]?.id).toBe('row-50'));
		expect(paged.result.current.page).toBe(1);
		expect(paged.result.current.pageCount).toBe(2);
		// The render that read the smaller total is thrown away before it commits,
		// so no committed render carries a page past the count it drew beside it.
		expect(paged.pages.filter((frame) => frame.page > frame.pageCount - 1)).toHaveLength(0);
	});
});

/**
 * The `/map/*` list endpoints read presence, so an absent filter has to leave its
 * param out rather than send a blank one. Every explorer used to spell that rule
 * out by hand, once per filter (#101).
 */
describe('mapQueryParams', () => {
	it('drops absent, empty, and empty-list values', () => {
		expect(
			mapQueryParams({
				regionId: [],
				dateFrom: undefined,
				dateTo: '',
				search: null,
				status: 'active',
			}),
		).toEqual({ status: 'active' });
	});

	it('joins id lists the way the endpoints parse them', () => {
		expect(mapQueryParams({ regionId: ['a', 'b', 'c'] })).toEqual({ regionId: 'a,b,c' });
	});

	// `isWet=false` is a real filter — dry inspections — not an absent one.
	it('keeps a false flag rather than treating it as unset', () => {
		expect(mapQueryParams({ isWet: false, positive: true })).toEqual({
			isWet: 'false',
			positive: 'true',
		});
	});
});
