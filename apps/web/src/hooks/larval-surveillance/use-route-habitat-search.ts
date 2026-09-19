import { sessionFetch } from '@simmer-mosquito/sync';
import { useQuery } from '@tanstack/react-query';
import { getServerUrl } from '../../auth';
import type { RouteHabitat } from '../../routes/larval-surveillance/habitats/-route-data';

const minSearchLength = 2;

/**
 * Name and address habitat search for the route add-stop picker, over the
 * server's `/map/habitats/search`, from two characters up.
 */
export function useRouteHabitatSearch(query: string): {
	readonly results: readonly RouteHabitat[];
	readonly isFetching: boolean;
	readonly isTooShort: boolean;
} {
	const q = query.trim();
	const enabled = q.length >= minSearchLength;
	const result = useQuery({
		enabled,
		queryKey: ['route', 'habitat-search', q],
		queryFn: ({ signal }) => fetchHabitatSearch(q, signal),
		placeholderData: (previous) => previous,
		staleTime: 10_000,
	});

	return {
		results: enabled ? (result.data ?? []) : [],
		isFetching: enabled && result.isFetching,
		isTooShort: q.length > 0 && q.length < minSearchLength,
	};
}

async function fetchHabitatSearch(query: string, signal: AbortSignal): Promise<RouteHabitat[]> {
	const url = new URL('/map/habitats/search', getServerUrl());
	url.searchParams.set('q', query);
	const response = await sessionFetch(url, { signal });
	if (!response.ok) {
		throw new Error(`Habitat search failed (${response.status}).`);
	}
	const body = (await response.json()) as { readonly habitats?: RouteHabitat[] };
	return body.habitats ?? [];
}
