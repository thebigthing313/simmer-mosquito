import { useQuery } from '@tanstack/react-query';
import {
	fetchHabitatGeometry,
	type HabitatGeometry,
	habitatGeometryQueryKey,
} from '../components/larval-surveillance/habitats/habitat-geometry-cache';

/** Nothing fetches this key; it only keeps the disabled query's key well-formed. */
const NO_HABITAT = 'none';

/**
 * A habitat's full geometry by id, from `/map/habitats/:id`, cached for the
 * session. Pass `null` for a record that links no habitat and the query stays
 * disabled.
 */
export function useHabitatGeometry(habitatId: string | null) {
	return useQuery({
		queryKey: habitatGeometryQueryKey(habitatId ?? NO_HABITAT),
		queryFn: ({ signal }): Promise<HabitatGeometry | null> =>
			habitatId === null ? Promise.resolve(null) : fetchHabitatGeometry(habitatId, signal),
		enabled: habitatId !== null,
		staleTime: Number.POSITIVE_INFINITY,
		placeholderData: (previous) => previous,
	});
}
