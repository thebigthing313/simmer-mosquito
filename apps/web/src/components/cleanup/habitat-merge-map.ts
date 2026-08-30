import { circlePolygon } from '@simmer-mosquito/mapping';
import type { DuplicateRecord, NearbyHabitat } from '../../hooks/use-merge-candidates';

/**
 * The map overlay: the radius, the habitat being kept, and what stands near it.
 *
 * The same three roles the service-request context view draws, painted by the
 * same layer. A habitat carries `family: 'surveillance'` because that is what it
 * is, and the ring is what turns the radius from a number on a button into a
 * distance a reader can see against the street it covers.
 */
export function mergeMapData(
	target: DuplicateRecord | undefined,
	candidates: readonly NearbyHabitat[],
	radiusMetres: number,
): GeoJSON.FeatureCollection | null {
	if (target === undefined || target.lat === null || target.lng === null) {
		return null;
	}

	const center = { lat: target.lat, lng: target.lng };
	const features: GeoJSON.Feature[] = [
		{
			type: 'Feature',
			properties: { role: 'ring' },
			geometry: circlePolygon(center, radiusMetres) as unknown as GeoJSON.Polygon,
		},
	];

	for (const candidate of candidates) {
		if (candidate.lat === null || candidate.lng === null) {
			continue;
		}
		features.push({
			type: 'Feature',
			properties: { role: 'nearby', id: candidate.id, family: 'surveillance' },
			geometry: { type: 'Point', coordinates: [candidate.lng, candidate.lat] },
		});
	}

	features.push({
		type: 'Feature',
		properties: { role: 'center' },
		geometry: { type: 'Point', coordinates: [center.lng, center.lat] },
	});

	return { type: 'FeatureCollection', features };
}
