import { sessionFetch } from '@simmer-mosquito/sync';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { getServerUrl } from '../../auth';
import { type RecordType, recordNoun } from '../../lib/record-nouns';

/** Rows per page on every explorer. */
const PAGE_SIZE = 50;

/** What a filter set contributes to a `/map/*` list request. */
export type MapQueryValue = string | number | boolean | readonly string[] | null | undefined;

/**
 * The filter params for a `/map/*` list request, with the empties dropped.
 *
 * An absent filter leaves its param out rather than sending a blank one: the
 * endpoints read presence, so `?regionId=` is not the same request as no
 * `regionId` at all.
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
	/**
	 * The page request has answered, with rows or with an error, and none is in
	 * flight. False before the map has a viewport, since no page has been asked
	 * for yet, and false again while a new page is on its way.
	 */
	readonly isSettled: boolean;
	/** Run the request again, for the retry the failure state offers. */
	readonly retry: () => void;
	readonly page: number;
	readonly pageCount: number;
	readonly setPage: (page: number) => void;
}

/**
 * One page of a `/map/*` list endpoint, with the paging state that goes with it.
 *
 * Keeps the previous page on screen while the next one loads, resets to the
 * first page when the request changes, and clamps back when the last page
 * empties out.
 */
export function usePagedMapResource<TRow>({
	path,
	rowsKey,
	recordType,
	params,
	enabled = true,
	normalizeRow,
}: {
	/** The list endpoint, e.g. `/map/source-reduction`. Also roots the query key. */
	readonly path: string;
	/** The key the rows arrive under in the response body, e.g. `sourceReductions`. */
	readonly rowsKey: string;
	/** What the page lists. Names the failure out of `lib/record-nouns.ts`. */
	readonly recordType: RecordType;
	readonly params: Readonly<Record<string, string>>;
	/** False while the request cannot be made yet, before the map has a viewport. */
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
		queryFn: ({ signal }) => fetchPage<TRow>(path, rowsKey, recordType, params, page, signal),
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

	const rows = normalized(query.data?.rows, normalizeRow);
	// `status` alone is not enough: `placeholderData` keeps it at `success` while
	// the next page loads, and a disabled query sits at `pending` without fetching.
	const isSettled = query.status !== 'pending' && !query.isFetching;

	const retry = () => {
		void query.refetch();
	};

	return {
		rows,
		total,
		isLoading: query.isLoading,
		isError: query.isError,
		isSettled,
		retry,
		page,
		pageCount,
		setPage,
	};
}

/** The page's rows, put through the caller's shaping if it asked for any. */
function normalized<TRow>(
	raw: readonly TRow[] | undefined,
	normalizeRow: ((row: TRow) => TRow) | undefined,
): readonly TRow[] {
	if (raw === undefined) {
		return [];
	}
	return normalizeRow === undefined ? raw : raw.map(normalizeRow);
}

/** A stable key for a param set. Object key order must not key two requests. */
function stableParamsKey(params: Readonly<Record<string, string>>): string {
	return Object.entries(params)
		.sort(([first], [second]) => (first < second ? -1 : first > second ? 1 : 0))
		.map(([key, value]) => `${key}=${value}`)
		.join('&');
}

async function fetchPage<TRow>(
	path: string,
	rowsKey: string,
	recordType: RecordType,
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

	const response = await sessionFetch(url, { signal });
	if (!response.ok) {
		throw new Error(`${recordNoun(recordType).titleMany} request failed (${response.status}).`);
	}
	const body = (await response.json()) as Record<string, unknown>;
	const rows = body[rowsKey];
	return {
		rows: Array.isArray(rows) ? (rows as readonly TRow[]) : [],
		total: typeof body.total === 'number' ? body.total : 0,
	};
}
