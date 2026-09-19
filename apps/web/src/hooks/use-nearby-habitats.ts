import { sessionFetch } from '@simmer-mosquito/sync';
import { useQuery } from '@tanstack/react-query';
import { getServerUrl } from '../auth';
import { type NearbyHabitats, nearbyHabitatsQueryKey } from './merge-candidate-view';

/**
 * The habitats standing within `radiusMetres` of one habitat, with the target
 * itself, refetched on focus.
 */
export function useNearbyHabitats(habitatId: string, radiusMetres: number) {
	return useQuery({
		queryKey: nearbyHabitatsQueryKey(habitatId, radiusMetres),
		queryFn: async ({ signal }) => {
			const url = new URL(`/records/habitat/${habitatId}/nearby`, getServerUrl());
			url.searchParams.set('radiusMetres', String(Math.round(radiusMetres)));
			const response = await sessionFetch(url, { signal });
			if (!response.ok) {
				throw new Error(`Could not look for nearby habitats (${response.status}).`);
			}
			return (await response.json()) as NearbyHabitats;
		},
		staleTime: 15_000,
		refetchOnWindowFocus: true,
	});
}
