import type { GeoJsonGeometry, GeoJsonProperties } from './geometry.js';

export type MapFeatureKind =
	| 'habitat'
	| 'trap'
	| 'inspection'
	| 'serviceRequest'
	| 'controlAction'
	| 'missionItem'
	| 'routeItem'
	| 'region'
	| (string & {});

export type MapFeatureRenderMode = 'mvt' | 'geojson';

export interface MapFeatureRef {
	readonly kind: MapFeatureKind;
	readonly id: string;
	readonly sourceId?: string;
	readonly renderMode?: MapFeatureRenderMode;
}

export interface MapRenderableFeature<
	TProperties extends GeoJsonProperties = GeoJsonProperties,
	TGeometry extends GeoJsonGeometry = GeoJsonGeometry,
> {
	readonly ref: MapFeatureRef;
	readonly geometry: TGeometry;
	readonly properties: TProperties;
}

export function mapFeatureRefKey(ref: MapFeatureRef): string {
	return `${ref.kind}:${ref.id}`;
}

export function normalizeMapFeatureRefs(refs: readonly MapFeatureRef[]): readonly MapFeatureRef[] {
	const seen = new Set<string>();
	const normalized: MapFeatureRef[] = [];

	for (const ref of refs) {
		const key = mapFeatureRefKey(ref);
		if (seen.has(key)) continue;
		seen.add(key);
		normalized.push(ref);
	}

	return normalized;
}
