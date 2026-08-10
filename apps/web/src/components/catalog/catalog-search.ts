import { useMemo, useState } from 'react';

/** Show the filter only once the list is large enough to be worth scanning. */
const SEARCH_THRESHOLD = 6;

export interface CatalogSearch<Row> {
	readonly search: string;
	readonly setSearch: (value: string) => void;
	/** Trimmed and lowercased — what `matches` was handed. */
	readonly query: string;
	readonly filteredActive: readonly Row[];
	readonly filteredInactive: readonly Row[];
	readonly activeCount: number;
	readonly inactiveCount: number;
	readonly total: number;
	readonly showSearch: boolean;
	readonly hasMatches: boolean;
}

/**
 * The filter over a lifecycle-split catalog: the query, the two filtered halves,
 * and the counts the page frame reports.
 *
 * `matches` is called with the already-trimmed, already-lowercased query and is
 * never asked about an empty one — a blank filter returns every row untouched,
 * so a catalog that searches name and description writes only that.
 */
export function useCatalogSearch<Row>(
	activeRows: readonly Row[],
	inactiveRows: readonly Row[],
	matches: (row: Row, query: string) => boolean,
): CatalogSearch<Row> {
	const [search, setSearch] = useState('');
	const query = search.trim().toLowerCase();

	const filteredActive = useMemo(
		() => filterRows(activeRows, query, matches),
		[activeRows, query, matches],
	);
	const filteredInactive = useMemo(
		() => filterRows(inactiveRows, query, matches),
		[inactiveRows, query, matches],
	);

	const total = activeRows.length + inactiveRows.length;

	return {
		search,
		setSearch,
		query,
		filteredActive,
		filteredInactive,
		activeCount: activeRows.length,
		inactiveCount: inactiveRows.length,
		total,
		showSearch: total > SEARCH_THRESHOLD,
		hasMatches: filteredActive.length + filteredInactive.length > 0,
	};
}

function filterRows<Row>(
	rows: readonly Row[],
	query: string,
	matches: (row: Row, query: string) => boolean,
): readonly Row[] {
	if (query.length === 0) {
		return rows;
	}
	return rows.filter((row) => matches(row, query));
}
