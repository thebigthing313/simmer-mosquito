import { useQuery } from '@tanstack/react-query';
import type { RecordLocationContext } from '../components/map/record-location-card';
import {
	fetchHabitatGeometry,
	type HabitatGeometry,
	habitatGeometryQueryKey,
} from '../routes/-habitat-geometry-cache';

/** Nothing fetches this key; it only keeps the disabled query's key well-formed. */
const NO_HABITAT = 'none';

/**
 * A habitat's full geometry, by id.
 *
 * Habitat geometry is not part of the Electric shape (ADR 0009) — the synced row
 * carries only a centroid — so any surface that needs the real polygon reads it
 * from `/map/habitats/:id`. The habitat detail page needs it to draw itself; the
 * control-action detail pages need it to draw the habitat *behind* the action.
 *
 * Pass `null` for records that link no habitat: the query stays disabled rather
 * than making the caller branch around the hook.
 *
 * Keyed on habitat id alone (not `updatedAt`), so an unrelated field edit does
 * not refetch geometry and the create/edit flows can seed the exact key — see
 * `seedHabitatGeometryCache`.
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

/**
 * The habitat a record was worked against, shaped for a
 * {@link RecordLocationCard}'s context underlay.
 *
 * Returns `undefined` — not an empty context — when there is no habitat or the
 * habitat itself stores no geometry, so the card falls back to its plain
 * single-record behaviour instead of drawing an empty legend.
 */
export function useHabitatLocationContext(
	habitatId: string | null,
	habitatName: string | null,
): RecordLocationContext | undefined {
	const query = useHabitatGeometry(habitatId);
	const geojson = query.data?.geojson ?? null;

	if (habitatId === null || geojson === null) {
		return undefined;
	}
	return {
		geojson,
		kind: 'Habitat',
		// Habitats may be unnamed; a short id still tells two of them apart.
		name: habitatName ?? habitatId.slice(0, 8),
	};
}
