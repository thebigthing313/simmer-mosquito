/** @vitest-environment jsdom */
import type { SearchResponse, SearchResult } from '@simmer-mosquito/domain';
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PAGE_SIZE, useAccumulatedPages } from '../../../../hooks/search/use-accumulated-pages';
import type { useGlobalSearch } from '../../../../hooks/search/use-global-search';

type Slice = ReturnType<typeof useGlobalSearch>;

function rows(offset: number, count: number): readonly SearchResult[] {
	return Array.from({ length: count }, (_, index) => ({
		kind: 'record',
		id: `habitat-${offset + index}`,
		title: `Habitat ${offset + index}`,
		table: 'habitats',
		matchedField: 'code',
		matchClass: 'exact',
	}));
}

/** What the query hook hands back once a slice has landed; only `data` is read. */
function landed(query: string, offset: number, results: readonly SearchResult[]): Slice {
	const data: SearchResponse = {
		query,
		offset,
		limit: PAGE_SIZE,
		total: 100,
		counts: { records: 100, comments: 0 },
		results,
	};
	return { data } as Slice;
}

const LOADING = { data: undefined } as Slice;

function ids(list: readonly SearchResult[]): string[] {
	return list.map((row) => row.id);
}

interface Props {
	readonly query: string;
	readonly first: Slice;
	readonly next: Slice;
	readonly nextOffset: number;
}

function renderPages(initial: Props) {
	return renderHook(
		({ query, first, next, nextOffset }: Props) =>
			useAccumulatedPages(query, undefined, [first, next], nextOffset),
		{ initialProps: initial },
	);
}

describe('the accumulated result list', () => {
	it('is the first slice in the render it lands in', () => {
		const first = landed('aedes', 0, rows(0, PAGE_SIZE));
		const pages = renderPages({ query: 'aedes', first, next: first, nextOffset: 0 });
		expect(ids(pages.result.current.rows)).toEqual(ids(rows(0, PAGE_SIZE)));
		expect(pages.result.current.reachedEnd).toBe(false);
	});

	it('keeps an earlier slice on the list while the next one loads', () => {
		const first = landed('aedes', 0, rows(0, PAGE_SIZE));
		const pages = renderPages({ query: 'aedes', first, next: first, nextOffset: 0 });
		const second = landed('aedes', PAGE_SIZE, rows(PAGE_SIZE, PAGE_SIZE));
		pages.rerender({ query: 'aedes', first, next: second, nextOffset: PAGE_SIZE });
		// The third slice is requested, so `next` no longer holds the second.
		pages.rerender({ query: 'aedes', first, next: LOADING, nextOffset: PAGE_SIZE * 2 });
		expect(ids(pages.result.current.rows)).toEqual(ids(rows(0, PAGE_SIZE * 2)));

		const third = landed('aedes', PAGE_SIZE * 2, rows(PAGE_SIZE * 2, PAGE_SIZE));
		pages.rerender({ query: 'aedes', first, next: third, nextOffset: PAGE_SIZE * 2 });
		expect(ids(pages.result.current.rows)).toEqual(ids(rows(0, PAGE_SIZE * 3)));
	});

	it('reads a short last slice as the end of the list', () => {
		const first = landed('aedes', 0, rows(0, PAGE_SIZE));
		const pages = renderPages({ query: 'aedes', first, next: first, nextOffset: 0 });
		const last = landed('aedes', PAGE_SIZE, rows(PAGE_SIZE, 3));
		pages.rerender({ query: 'aedes', first, next: last, nextOffset: PAGE_SIZE });
		expect(pages.result.current.reachedEnd).toBe(true);
		expect(pages.result.current.rows).toHaveLength(PAGE_SIZE + 3);
	});

	it('starts empty for a new query in the render that sees it', () => {
		const first = landed('aedes', 0, rows(0, PAGE_SIZE));
		const pages = renderPages({ query: 'aedes', first, next: first, nextOffset: 0 });
		const second = landed('aedes', PAGE_SIZE, rows(PAGE_SIZE, PAGE_SIZE));
		pages.rerender({ query: 'aedes', first, next: second, nextOffset: PAGE_SIZE });

		// The old query's slices are still what the two hooks hold until the new
		// request answers, and none of them belongs on the new list.
		pages.rerender({ query: 'culex', first, next: second, nextOffset: 0 });
		expect(pages.result.current.rows).toEqual([]);
		expect(pages.result.current.reachedEnd).toBe(false);

		const fresh = landed('culex', 0, rows(500, 4));
		pages.rerender({ query: 'culex', first: fresh, next: fresh, nextOffset: 0 });
		expect(ids(pages.result.current.rows)).toEqual(ids(rows(500, 4)));
	});

	it('ignores a slice answered for another offset than the one asked for', () => {
		const first = landed('aedes', 0, rows(0, PAGE_SIZE));
		const stale = landed('aedes', PAGE_SIZE, rows(PAGE_SIZE, PAGE_SIZE));
		const pages = renderPages({ query: 'aedes', first, next: stale, nextOffset: PAGE_SIZE * 2 });
		expect(pages.result.current.rows).toHaveLength(PAGE_SIZE);
	});
});
