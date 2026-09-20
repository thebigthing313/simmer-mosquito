import type { Map as MapboxMap } from 'mapbox-gl';
import { type RefObject, useEffect, useRef, useState } from 'react';
import { type MapboxSearchResult, suggestPlaces } from '../../components/map/mapbox-search-client';

const DEBOUNCE_MS = 180;

/** The answer to a place query, and the state of the request that fetched it. */
export interface PlaceSuggestions {
	readonly results: readonly MapboxSearchResult[];
	readonly isLoading: boolean;
	readonly error: string | null;
	/** The suggestion being retrieved, while one is. */
	readonly selectingId: string | null;
	/** Drop the answer: the box was cleared, or a suggestion was chosen. */
	readonly clear: () => void;
	readonly beginSelect: (id: string) => void;
	readonly failSelect: (message: string) => void;
	readonly endSelect: () => void;
}

/**
 * Debounced Mapbox place suggestions for `MapSearch`. Takes the map the
 * suggestions are biased to, the trimmed query, whether there is a query to
 * answer at all, and the session token the suggest and retrieve pair share.
 *
 * Going idle drops the answer and the request state with it, in the render
 * that notices rather than an effect one render later: React re-renders before
 * committing, so the stale rows are never drawn under a closed panel or a
 * query too short to have them.
 */
export function usePlaceSuggestions({
	map,
	query,
	searching,
	sessionToken,
}: {
	readonly map: MapboxMap | null;
	readonly query: string;
	readonly searching: boolean;
	readonly sessionToken: RefObject<string>;
}): PlaceSuggestions {
	const [results, setResults] = useState<readonly MapboxSearchResult[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [selectingId, setSelectingId] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const requestId = useRef(0);

	const [wasSearching, setWasSearching] = useState(searching);
	if (wasSearching !== searching) {
		setWasSearching(searching);
		if (!searching) {
			setResults([]);
			setIsLoading(false);
			setError(null);
			setSelectingId(null);
		}
	}

	useEffect(() => {
		if (!searching) {
			return;
		}

		const controller = new AbortController();
		const currentRequest = requestId.current + 1;
		requestId.current = currentRequest;

		const timeout = window.setTimeout(() => {
			setIsLoading(true);
			setSelectingId(null);
			setError(null);
			suggestPlaces({
				query,
				sessionToken: sessionToken.current,
				signal: controller.signal,
				map,
			})
				.then((next) => {
					if (requestId.current === currentRequest) {
						setResults(next);
					}
				})
				.catch((unknownError: unknown) => {
					if (unknownError instanceof DOMException && unknownError.name === 'AbortError') {
						return;
					}
					if (requestId.current === currentRequest) {
						setResults([]);
						setError('Search unavailable');
					}
				})
				.finally(() => {
					if (requestId.current === currentRequest) {
						setIsLoading(false);
					}
				});
		}, DEBOUNCE_MS);

		return () => {
			window.clearTimeout(timeout);
			controller.abort();
		};
	}, [map, searching, query, sessionToken]);

	return {
		results,
		isLoading,
		error,
		selectingId,
		clear: () => {
			setSelectingId(null);
			setResults([]);
			setError(null);
		},
		beginSelect: (id) => {
			setSelectingId(id);
			setError(null);
		},
		failSelect: (message) => setError(message),
		endSelect: () => setSelectingId(null),
	};
}
