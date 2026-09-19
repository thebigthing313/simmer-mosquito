import type { RecordLocationContext } from '../components/map/record-location-card';
import { useHabitatGeometry } from './use-habitat-geometry';
/**
 * The habitat a record was worked against, shaped for a `RecordLocationCard`'s
 * context underlay, or `undefined` when there is no habitat or it stores no
 * geometry.
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
