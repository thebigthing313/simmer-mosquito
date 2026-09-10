import { useState } from 'react';

/**
 * Client paging over rows a card already holds.
 *
 * The rows are in memory, so this is a slice and a page number rather than a
 * fetch. `ExplorerPagination` is the footer it feeds, and the pair is what the
 * habitat history tabs and the trap collections card each wrote for themselves
 * before #865.
 *
 * The two copies clamped differently and only one can be right. The clamp is
 * computed in render here and never written back to state, which is the trap
 * version's rule. The habitat version stored it in an effect, which costs a
 * second render after paint and, worse, loses where the reader was: a live sync
 * that drops rows and then restores them left the effect version on page 1 with
 * nothing saying why. State holds the page the reader asked for and the clamp is
 * what fits that into the rows there are today, so the ask survives the rows
 * moving under it.
 *
 * `resetKey` is the other half of the same idea and is the record the rows
 * belong to. A detail card is one component instance across a change of route
 * param, so without it an operator who paged into a trap's history and then
 * opened another trap arrives on page 3 of a card they have not read.
 */
export function usePagedRows<Row>(
	rows: readonly Row[],
	{ pageSize, resetKey }: { readonly pageSize: number; readonly resetKey?: string | undefined },
): {
	readonly page: number;
	readonly pageCount: number;
	readonly pageRows: readonly Row[];
	readonly setPage: (page: number) => void;
} {
	const [page, setPage] = useState(0);
	// React's adjust-state-during-render pattern: cheaper than an effect, and the
	// rows below never draw the page belonging to the record just navigated away
	// from.
	const [seenKey, setSeenKey] = useState(resetKey);
	if (seenKey !== resetKey) {
		setSeenKey(resetKey);
		setPage(0);
	}

	// One page for no rows at all: a card with nothing in it is on the only page
	// it has, and `pageCount` of 0 would put the footer at "page 1 of 0".
	const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
	const clamped = Math.min(page, pageCount - 1);
	const start = clamped * pageSize;

	return {
		page: clamped,
		pageCount,
		pageRows: rows.slice(start, start + pageSize),
		setPage,
	};
}
