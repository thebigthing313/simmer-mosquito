import type { SearchDocumentClass, SearchResult } from '@simmer-mosquito/domain';
import { useEffect, useState } from 'react';
import type { useGlobalSearch } from './use-global-search';

/**
 * How many rows one slice of the list holds. Infinite scroll fetches the next
 * `offset` at a sentinel, so the wire is unchanged and only the control differs.
 */
export const PAGE_SIZE = 25;

/**
 * The slices loaded so far for one query, accumulated by offset, and whether
 * the last slice came back short.
 */
export function useAccumulatedPages(
	query: string,
	documentClass: SearchDocumentClass | undefined,
	[first, next]: readonly [ReturnType<typeof useGlobalSearch>, ReturnType<typeof useGlobalSearch>],
	nextOffset: number,
): { readonly rows: readonly SearchResult[]; readonly reachedEnd: boolean } {
	const [pages, setPages] = useState<Record<number, readonly SearchResult[]>>({});
	// biome-ignore lint/correctness/useExhaustiveDependencies: `query` and `documentClass` are this hook's parameters, not outer scope; dropping them leaves the previous query's rows in the list
	useEffect(() => setPages({}), [query, documentClass]);

	const firstResults =
		first.data?.query === query && first.data.offset === 0 ? first.data.results : undefined;
	const nextResults =
		next.data?.query === query && next.data.offset === nextOffset ? next.data.results : undefined;

	useEffect(() => {
		if (firstResults !== undefined) {
			setPages((current) => ({ ...current, 0: firstResults }));
		}
	}, [firstResults]);

	useEffect(() => {
		if (nextResults !== undefined) {
			setPages((current) => ({ ...current, [nextOffset]: nextResults }));
		}
	}, [nextResults, nextOffset]);

	const lastLoaded = pages[nextOffset];
	return {
		rows: Object.keys(pages)
			.map(Number)
			.sort((left, right) => left - right)
			.flatMap((offset) => pages[offset] ?? []),
		reachedEnd: lastLoaded !== undefined && lastLoaded.length < PAGE_SIZE,
	};
}
