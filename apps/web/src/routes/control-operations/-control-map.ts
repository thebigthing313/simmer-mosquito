// Performed control actions carry their own owned geometry, streamed as
// `lat` / `lng` / `geomType` on the synced row (docs/sync.md; owned-geometry
// migration). The explorers read those columns directly and render them as a
// GeoJSON point overlay — there is no control-operations map/bounds endpoint.

export interface ControlMapPoint {
	readonly id: string;
	readonly lat: number;
	readonly lng: number;
}

/** Build a Point FeatureCollection the shared GeoJSON overlay layer can render. */
export function toPointFeatureCollection(
	points: readonly ControlMapPoint[],
): GeoJSON.FeatureCollection {
	return {
		type: 'FeatureCollection',
		features: points.map((point) => ({
			type: 'Feature',
			id: point.id,
			properties: { id: point.id },
			geometry: { type: 'Point', coordinates: [point.lng, point.lat] },
		})),
	};
}
