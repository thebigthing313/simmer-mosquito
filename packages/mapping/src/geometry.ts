export interface LngLat {
	readonly lng: number;
	readonly lat: number;
}

export interface BoundingBox {
	readonly west: number;
	readonly south: number;
	readonly east: number;
	readonly north: number;
}

export type GeoJsonPosition = readonly [number, number] | readonly [number, number, number];

export interface GeoJsonPoint {
	readonly type: 'Point';
	readonly coordinates: GeoJsonPosition;
}

export interface GeoJsonMultiPoint {
	readonly type: 'MultiPoint';
	readonly coordinates: readonly GeoJsonPosition[];
}

export interface GeoJsonLineString {
	readonly type: 'LineString';
	readonly coordinates: readonly GeoJsonPosition[];
}

export interface GeoJsonMultiLineString {
	readonly type: 'MultiLineString';
	readonly coordinates: readonly (readonly GeoJsonPosition[])[];
}

export interface GeoJsonPolygon {
	readonly type: 'Polygon';
	readonly coordinates: readonly (readonly GeoJsonPosition[])[];
}

export interface GeoJsonMultiPolygon {
	readonly type: 'MultiPolygon';
	readonly coordinates: readonly (readonly (readonly GeoJsonPosition[])[])[];
}

export type GeoJsonGeometry =
	| GeoJsonPoint
	| GeoJsonMultiPoint
	| GeoJsonLineString
	| GeoJsonMultiLineString
	| GeoJsonPolygon
	| GeoJsonMultiPolygon;

export type GeoJsonGeometryType = GeoJsonGeometry['type'];
export type GeoJsonProperties = Readonly<Record<string, string | number | boolean | null>>;

export interface GeoJsonFeature<
	TProperties extends GeoJsonProperties = GeoJsonProperties,
	TGeometry extends GeoJsonGeometry = GeoJsonGeometry,
> {
	readonly type: 'Feature';
	readonly id?: string | number;
	readonly geometry: TGeometry;
	readonly properties: TProperties;
}

export interface GeoJsonFeatureCollection<
	TProperties extends GeoJsonProperties = GeoJsonProperties,
	TGeometry extends GeoJsonGeometry = GeoJsonGeometry,
> {
	readonly type: 'FeatureCollection';
	readonly features: readonly GeoJsonFeature<TProperties, TGeometry>[];
}

export function isLngLat(value: unknown): value is LngLat {
	if (!isRecord(value)) return false;
	return isValidLng(value.lng) && isValidLat(value.lat);
}

export function toLngLat(position: GeoJsonPosition): LngLat {
	return { lng: position[0], lat: position[1] };
}

export function isBoundingBox(value: unknown): value is BoundingBox {
	if (!isRecord(value)) return false;
	return (
		isValidLng(value.west) &&
		isValidLng(value.east) &&
		isValidLat(value.south) &&
		isValidLat(value.north) &&
		value.west <= value.east &&
		value.south <= value.north
	);
}

export function parseBoundingBox(value: string): BoundingBox | null {
	const parts = value.split(',').map((part) => Number.parseFloat(part.trim()));
	if (parts.length !== 4) return null;
	const [west, south, east, north] = parts;
	if (west == null || south == null || east == null || north == null) return null;
	const bbox = { west, south, east, north };
	return isBoundingBox(bbox) ? bbox : null;
}

export function formatBoundingBox(bbox: BoundingBox, decimals = 6): string {
	return [
		formatCoordinate(bbox.west, decimals),
		formatCoordinate(bbox.south, decimals),
		formatCoordinate(bbox.east, decimals),
		formatCoordinate(bbox.north, decimals),
	].join(',');
}

export function containsLngLat(bbox: BoundingBox, point: LngLat): boolean {
	return (
		point.lng >= bbox.west &&
		point.lng <= bbox.east &&
		point.lat >= bbox.south &&
		point.lat <= bbox.north
	);
}

export function extendBounds(bbox: BoundingBox | null, point: LngLat): BoundingBox {
	if (bbox === null) {
		return {
			west: point.lng,
			south: point.lat,
			east: point.lng,
			north: point.lat,
		};
	}

	return {
		west: Math.min(bbox.west, point.lng),
		south: Math.min(bbox.south, point.lat),
		east: Math.max(bbox.east, point.lng),
		north: Math.max(bbox.north, point.lat),
	};
}

export function boundsFromCoordinates(points: readonly LngLat[]): BoundingBox | null {
	let bounds: BoundingBox | null = null;
	for (const point of points) {
		if (isLngLat(point)) bounds = extendBounds(bounds, point);
	}
	return bounds;
}

export function boundsFromGeoJson(geometry: GeoJsonGeometry): BoundingBox | null {
	const points = collectGeometryCoordinates(geometry);
	return boundsFromCoordinates(points);
}

export function centroidFromGeoJson(geometry: GeoJsonGeometry): LngLat | null {
	if (geometry.type === 'Point') return toLngLat(geometry.coordinates);

	const points = collectGeometryCoordinates(geometry);
	if (points.length === 0) return null;

	let lng = 0;
	let lat = 0;
	for (const point of points) {
		lng += point.lng;
		lat += point.lat;
	}

	return {
		lng: lng / points.length,
		lat: lat / points.length,
	};
}

export interface OwnedCentroid {
	readonly lat: number;
	readonly lng: number;
	readonly geomType: string;
}

/**
 * Derive the trigger-maintained centroid columns (lat, lng, geomType) from a
 * drawn GeoJSON geometry for an optimistic write. Mirrors the database
 * `set_owned_centroid()` trigger: geomType uses the lowercased PostGIS `ST_*`
 * form (e.g. `st_point`) so the optimistic row matches the synced row. Returns
 * null for empty/degenerate geometry.
 */
export function ownedCentroidFromGeoJson(geometry: GeoJsonGeometry): OwnedCentroid | null {
	const centroid = centroidFromGeoJson(geometry);
	if (centroid === null) return null;
	return {
		lat: centroid.lat,
		lng: centroid.lng,
		geomType: `st_${geometry.type.toLowerCase()}`,
	};
}

export function countGeoJsonVertices(geometry: GeoJsonGeometry): number {
	switch (geometry.type) {
		case 'Point':
			return 1;
		case 'MultiPoint':
		case 'LineString':
			return geometry.coordinates.length;
		case 'MultiLineString':
			return geometry.coordinates.reduce((total, line) => total + line.length, 0);
		case 'Polygon':
			return countPolygonVertices(geometry.coordinates);
		case 'MultiPolygon':
			return geometry.coordinates.reduce(
				(total, polygon) => total + countPolygonVertices(polygon),
				0,
			);
	}
}

function countPolygonVertices(polygon: readonly (readonly GeoJsonPosition[])[]): number {
	return polygon.reduce((total, ring) => total + countRingVertices(ring), 0);
}

function countRingVertices(ring: readonly GeoJsonPosition[]): number {
	if (ring.length < 2) return ring.length;

	const first = ring[0];
	const last = ring[ring.length - 1];
	if (first !== undefined && last !== undefined && positionsEqual(first, last)) {
		return ring.length - 1;
	}
	return ring.length;
}

function positionsEqual(a: GeoJsonPosition, b: GeoJsonPosition): boolean {
	return a[0] === b[0] && a[1] === b[1];
}

function collectGeometryCoordinates(geometry: GeoJsonGeometry): LngLat[] {
	const points: LngLat[] = [];
	collectCoordinates(geometry.coordinates, points);
	return points;
}

function collectCoordinates(value: unknown, points: LngLat[]): void {
	if (isGeoJsonPosition(value)) {
		points.push(toLngLat(value));
		return;
	}

	if (!Array.isArray(value)) return;
	for (const item of value) collectCoordinates(item, points);
}

function isGeoJsonPosition(value: unknown): value is GeoJsonPosition {
	if (!Array.isArray(value) || value.length < 2) return false;
	return isValidLng(value[0]) && isValidLat(value[1]);
}

function isValidLng(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value) && value >= -180 && value <= 180;
}

function isValidLat(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value) && value >= -90 && value <= 90;
}

function formatCoordinate(value: number, decimals: number): string {
	const fixed = value.toFixed(decimals);
	if (!fixed.includes('.')) return fixed;
	return fixed.replace(/0+$/, '').replace(/\.$/, '');
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
