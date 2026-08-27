import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { getServerUrl } from '../../auth';

/** Rows per page on every explorer. */
const PAGE_SIZE = 50;

/** What a filter set contributes to a `/map/*` list request. */
export type MapQueryValue = string | number | boolean | readonly string[] | null | undefined;

/**
 * The filter params for a `/map/*` list request, with the empties dropped.
 *
 * An absent filter must leave its param out rather than send a blank one — the
 * endpoints read presence, so `?regionId=` is not the same request as no
 * `regionId` at all. Every explorer wrote that rule out as a wall of `if (x
 * !== undefined && x.length > 0)`.
 */
export function mapQueryParams(
	source: Readonly<Record<string, MapQueryValue>>,
): Readonly<Record<string, string>> {
	const params: Record<string, string> = {};
	for (const [key, value] of Object.entries(source)) {
		if (value === undefined || value === null) {
			continue;
		}
		if (Array.isArray(value)) {
			if (value.length > 0) {
				params[key] = value.join(',');
			}
			continue;
		}
		const text = String(value);
		if (text !== '') {
			params[key] = text;
		}
	}
	return params;
}

export interface PagedMapResource<TRow> {
	readonly rows: readonly TRow[];
	readonly total: number;
	readonly isLoading: boolean;
	/** The request failed. The rows are the last good answer, or none at all. */
	readonly isError: boolean;
	/** Run the request again, for the retry the failure state offers. */
	readonly retry: () => void;
	readonly page: number;
	readonly pageCount: number;
	readonly setPage: (page: number) => void;
}

/**
 * One page of a `/map/*` list endpoint, with the paging state that goes with it.
 *
 * Eight explorers held the same three pieces — the `useQuery` that keeps the
 * previous page on screen while the next one loads, the page count, and the two
 * effects that reset to the first page when the filters change and clamp back
 * when the last page empties out. Owning `page` here is what lets the reset
 * effect key on the request rather than on whatever the caller happened to
 * memoize.
 */
export function usePagedMapResource<TRow>({
	path,
	rowsKey,
	label,
	params,
	enabled = true,
	normalizeRow,
}: {
	/** The list endpoint, e.g. `/map/source-reduction`. Also roots the query key. */
	readonly path: string;
	/** The key the rows arrive under in the response body, e.g. `sourceReductions`. */
	readonly rowsKey: string;
	/** Plural noun for the failure message, e.g. `Source reductions`. */
	readonly label: string;
	readonly params: Readonly<Record<string, string>>;
	/** False while the request cannot be made yet — before the map has a viewport. */
	readonly enabled?: boolean;
	/** Defaults a row's newer fields, where a deployed server may not send them. */
	readonly normalizeRow?: (row: TRow) => TRow;
}): PagedMapResource<TRow> {
	const [page, setPage] = useState(0);
	const paramsKey = stableParamsKey(params);

	// A new filter set (or a new viewport) always starts at the first page.
	// biome-ignore lint/correctness/useExhaustiveDependencies: reset keyed on the request.
	useEffect(() => {
		setPage(0);
	}, [paramsKey]);

	const query = useQuery({
		enabled,
		queryKey: [path, 'page', paramsKey, page],
		queryFn: ({ signal }) => fetchPage<TRow>(path, rowsKey, label, params, page, signal),
		placeholderData: (previous) => previous,
	});

	const total = query.data?.total ?? 0;
	const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
	// Clamp if the row count shrinks under the current page (e.g. after a delete).
	useEffect(() => {
		if (page > pageCount - 1) {
			setPage(pageCount - 1);
		}
	}, [page, pageCount]);

	const raw = query.data?.rows;
	const rows = useMemo(
		() => (raw === undefined ? [] : normalizeRow === undefined ? raw : raw.map(normalizeRow)),
		[raw, normalizeRow],
	);

	const retry = useCallback(() => {
		void query.refetch();
	}, [query.refetch]);

	return {
		rows,
		total,
		isLoading: query.isLoading,
		isError: query.isError,
		retry,
		page,
		pageCount,
		setPage,
	};
}

/**
 * The record the map selection points at, whether or not it is on this page.
 *
 * A selection can come from the tiles, which draw every match rather than the
 * fifty in the rail, so the row may be nowhere in `rows`. Eight explorers
 * resolved that with the same pair: read the page first, fall back to fetching
 * the one record by id.
 */
export function useSelectedMapRecord<TRow extends { readonly id: string }>({
	path,
	rowKey,
	rows,
	selectedId,
	normalizeRow,
}: {
	readonly path: string;
	/** The key the record arrives under in the response body, e.g. `sourceReduction`. */
	readonly rowKey: string;
	readonly rows: readonly TRow[];
	readonly selectedId: string | null;
	readonly normalizeRow?: (row: TRow) => TRow;
}): TRow | null {
	const visibleById = useMemo(() => new Map(rows.map((row) => [row.id, row])), [rows]);
	const needsFetch = selectedId !== null && !visibleById.has(selectedId);
	const query = useQuery({
		enabled: needsFetch,
		queryKey: [path, 'detail', selectedId],
		queryFn: ({ signal }) => fetchRecord<TRow>(path, rowKey, selectedId ?? '', signal),
	});

	if (selectedId === null) {
		return null;
	}
	const onPage = visibleById.get(selectedId);
	if (onPage !== undefined) {
		return onPage;
	}
	const fetched = query.data ?? null;
	if (fetched === null) {
		return null;
	}
	return normalizeRow === undefined ? fetched : normalizeRow(fetched);
}

/** A stable key for a param set — object key order must not key two requests. */
function stableParamsKey(params: Readonly<Record<string, string>>): string {
	return Object.entries(params)
		.sort(([first], [second]) => (first < second ? -1 : first > second ? 1 : 0))
		.map(([key, value]) => `${key}=${value}`)
		.join('&');
}

async function fetchPage<TRow>(
	path: string,
	rowsKey: string,
	label: string,
	params: Readonly<Record<string, string>>,
	page: number,

	signal: AbortSignal,
): Promise<{ readonly rows: readonly TRow[]; readonly total: number }> {
	const url = new URL(path, getServerUrl());
	url.searchParams.set('limit', String(PAGE_SIZE));
	url.searchParams.set('offset', String(page * PAGE_SIZE));
	for (const [key, value] of Object.entries(params)) {
		url.searchParams.set(key, value);
	}

	const response = await fetch(url, { credentials: 'include', signal });
	if (!response.ok) {
		throw new Error(`${label} request failed (${response.status}).`);
	}
	const body = (await response.json()) as Record<string, unknown>;
	const rows = body[rowsKey];
	return {
		rows: Array.isArray(rows) ? (rows as readonly TRow[]) : [],
		total: typeof body.total === 'number' ? body.total : 0,
	};
}

async function fetchRecord<TRow>(
	path: string,
	rowKey: string,
	id: string,
	signal: AbortSignal,
): Promise<TRow | null> {
	if (id.length === 0) {
		return null;
	}
	const response = await fetch(new URL(`${path}/${id}`, getServerUrl()), {
		credentials: 'include',
		signal,
	});
	if (!response.ok) {
		return null;
	}
	const body = (await response.json()) as Record<string, unknown>;
	const row = body[rowKey];
	return row === undefined || row === null ? null : (row as TRow);
}
