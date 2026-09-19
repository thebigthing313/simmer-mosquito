import { SEARCH_MAX_OFFSET, type SearchDocumentClass } from '@simmer-mosquito/domain';
import { useEffect, useState } from 'react';
import { PAGE_SIZE, useAccumulatedPages } from './use-accumulated-pages';
import { useGlobalSearch } from './use-global-search';
import { useGrowOnVisible } from './use-grow-on-visible';

/**
 * The search page's accumulated result list for a query: the rows across every
 * slice loaded so far, the counts, whether more can load, and the sentinel
 * that loads the next slice when it scrolls into view.
 */
export function useSearchResultList(query: string, documentClass: SearchDocumentClass | undefined) {
	const [slices, setSlices] = useState(1);
	// biome-ignore lint/correctness/useExhaustiveDependencies: `query` and `documentClass` are this hook's parameters, not outer scope; dropping them keeps the previous query's slice count
	useEffect(() => setSlices(1), [query, documentClass]);

	const nextOffset = (slices - 1) * PAGE_SIZE;
	const first = useGlobalSearch({
		query,
		limit: PAGE_SIZE,
		offset: 0,
		documentClass,
		keepPrevious: false,
	});
	const next = useGlobalSearch({
		query,
		limit: PAGE_SIZE,
		offset: nextOffset,
		documentClass,
		keepPrevious: false,
	});

	const pages = useAccumulatedPages(query, documentClass, [first, next], nextOffset);
	const rows = pages.rows;
	const total = first.data?.total ?? 0;

	/*
	 * Four conditions, and three of them are stops rather than the obvious one.
	 *
	 * `rows.length < total` alone is not enough, because the sentinel effect
	 * re-registers every time `next.isFetching` drops and `observe` fires
	 * immediately for an element already in view. So a slice that never lands — a
	 * failed request, or an offset past the endpoint's own cap — leaves
	 * `rows.length` short of `total` forever and the sentinel walks the offset
	 * upward one request at a time with nothing to show for it.
	 *
	 * A short page is the honest end of the list even when `total` disagrees,
	 * which it can: `total` is counted when the first slice ran, and a record can
	 * be deleted underneath a scroll.
	 */
	const hasMore =
		rows.length < total &&
		!pages.reachedEnd &&
		!next.isError &&
		slices * PAGE_SIZE <= SEARCH_MAX_OFFSET;

	const sentinel = useGrowOnVisible(hasMore && !next.isFetching, () =>
		setSlices((count) => count + 1),
	);

	return {
		counts: first.data?.counts ?? { records: 0, comments: 0 },
		first,
		hasMore,
		next,
		rows,
		sentinel,
		total,
	};
}
