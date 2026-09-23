import type { SearchDocumentClass, SearchResult } from '@simmer-mosquito/domain';
import { useState } from 'react';
import type { useGlobalSearch } from './use-global-search';

/**
 * How many rows one slice of the list holds. Infinite scroll fetches the next
 * `offset` at a sentinel, so the wire is unchanged and only the control differs.
 */
export const PAGE_SIZE = 25;

/** The list one query and document class name, which is what a slice belongs to. */
export interface SearchListKey {
	readonly query: string;
	readonly documentClass: SearchDocumentClass | undefined;
}

export function isSameList(held: SearchListKey, key: SearchListKey): boolean {
	return held.query === key.query && held.documentClass === key.documentClass;
}

type Pages = Readonly<Record<number, readonly SearchResult[]>>;

/**
 * The slices loaded so far for one query, accumulated by offset, and whether
 * the last slice came back short.
 *
 * The two queries only ever hold the first slice and the latest one, so the
 * slices between them are remembered here, keyed by the list they belong to.
 * A slice is remembered in the render it lands in, and a remembered slice for
 * another list reads as nothing, so a new query starts empty without a reset.
 */
export function useAccumulatedPages(
	query: string,
	documentClass: SearchDocumentClass | undefined,
	[first, next]: readonly [ReturnType<typeof useGlobalSearch>, ReturnType<typeof useGlobalSearch>],
	nextOffset: number,
): { readonly rows: readonly SearchResult[]; readonly reachedEnd: boolean } {
	const key: SearchListKey = { query, documentClass };
	const [held, setHeld] = useState<{ readonly list: SearchListKey; readonly pages: Pages }>({
		list: key,
		pages: {},
	});
	const remembered = isSameList(held.list, key) ? held.pages : {};

	const firstResults =
		first.data?.query === query && first.data.offset === 0 ? first.data.results : undefined;
	const nextResults =
		next.data?.query === query && next.data.offset === nextOffset ? next.data.results : undefined;

	const landed: Pages = {
		...(firstResults === undefined ? {} : { 0: firstResults }),
		...(nextResults === undefined ? {} : { [nextOffset]: nextResults }),
	};
	const pages = { ...remembered, ...landed };
	// A slice that has landed and is not yet remembered is written now, during
	// render, so it is still on the list once `next` moves on to a later offset.
	// React re-renders before committing, so the write costs no frame.
	if (Object.entries(landed).some(([offset, rows]) => remembered[Number(offset)] !== rows)) {
		setHeld({ list: key, pages });
	}

	const lastLoaded = pages[nextOffset];
	return {
		rows: Object.keys(pages)
			.map(Number)
			.sort((left, right) => left - right)
			.flatMap((offset) => pages[offset] ?? []),
		reachedEnd: lastLoaded !== undefined && lastLoaded.length < PAGE_SIZE,
	};
}
