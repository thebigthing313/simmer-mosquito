import type { SearchDocumentClass, SearchResponse } from '@simmer-mosquito/domain';
import { type UseQueryResult, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { getServerUrl } from '../../auth';

/**
 * A refused query, told apart from a failed one.
 *
 * A 400 is a permanent answer: retried, it spends the backoff looking like a
 * slow load, and the person never learns the query was refused. `main.tsx` sets
 * only `staleTime` and `refetchOnWindowFocus`, so the default is three automatic
 * retries on everything including a 400, and every caller that cares has to say
 * so — as `-activity-monitor-data.ts` already does.
 */
export class SearchRequestError extends Error {
	readonly refused: boolean;

	constructor(message: string, refused: boolean) {
		super(message);
		this.name = 'SearchRequestError';
		this.refused = refused;
	}
}

export interface GlobalSearchInput {
	readonly query: string;
	readonly limit: number;
	readonly offset?: number;
	readonly documentClass?: SearchDocumentClass | undefined;
	/**
	 * Keep the previous query's answer on screen while a new one is in flight.
	 *
	 * The palette wants this: dimming the previous list under a live query *is*
	 * `placeholderData`. The results page does not, and the difference is not
	 * cosmetic. Placeholder data is returned under the *new* key, so a page
	 * accumulator cannot tell a fresh answer from the last one and files the
	 * previous query's rows under the new offset. The page shows skeletons and a
	 * zeroed rail instead, which is what it is specced to show anyway.
	 */
	readonly keepPrevious?: boolean;
}

/**
 * The palette's and the results page's one read.
 *
 * Three behaviours the palette needs are properties of this hook rather than
 * things it builds:
 *
 * - Dimming the previous list under a live query **is** `placeholderData`.
 * - A superseded response lands in a cache entry nothing renders, because a new
 *   query string is a new key. Races need no other machinery; the abort is
 *   cleanup, not correctness.
 * - Closing the palette resets the field but does not abort the request in
 *   flight. It finishes into the cache, so reopening on the same query inside
 *   `staleTime` renders instantly.
 */
export function useGlobalSearch(input: GlobalSearchInput): UseQueryResult<SearchResponse, Error> {
	const offset = input.offset ?? 0;

	return useQuery({
		queryKey: ['global-search', input.query, input.limit, offset, input.documentClass ?? null],
		queryFn: ({ signal }) => fetchSearch(input, offset, signal),
		enabled: input.query.length > 0,
		placeholderData: (previous) => (input.keepPrevious === false ? undefined : previous),
		staleTime: 30_000,
		retry: (failureCount, error) =>
			!(error instanceof SearchRequestError && error.refused) && failureCount < 2,
	});
}

async function fetchSearch(
	input: GlobalSearchInput,
	offset: number,
	signal: AbortSignal,
): Promise<SearchResponse> {
	const url = new URL('/search', getServerUrl());
	url.searchParams.set('q', input.query);
	url.searchParams.set('limit', String(input.limit));
	url.searchParams.set('offset', String(offset));
	if (input.documentClass !== undefined) {
		url.searchParams.set('class', input.documentClass);
	}

	const response = await fetch(url, { credentials: 'include', signal });
	if (!response.ok) {
		throw new SearchRequestError(await refusalReason(response), response.status === 400);
	}

	return (await response.json()) as SearchResponse;
}

/** The server's own explanation where it gave one; the status code otherwise. */
async function refusalReason(response: Response): Promise<string> {
	try {
		const body = (await response.json()) as { readonly reason?: unknown };
		if (typeof body.reason === 'string' && body.reason.trim() !== '') {
			return body.reason;
		}
	} catch {
		// Not JSON; fall through to the status.
	}
	return `Search failed (${response.status}).`;
}

/**
 * The query, held back so a keystroke is not a request.
 *
 * 200ms, and no client floor on length: the endpoint accepts one character and a
 * one-character record search is real in this domain, where handles are codes.
 * Routes and actions are matched against the *un-debounced* value, so the list
 * never goes empty while this catches up.
 */
export function useDebouncedQuery(query: string, delayMs = 200): string {
	const [debounced, setDebounced] = useState(query);

	useEffect(() => {
		const timer = setTimeout(() => setDebounced(query), delayMs);
		return () => clearTimeout(timer);
	}, [query, delayMs]);

	return debounced;
}
