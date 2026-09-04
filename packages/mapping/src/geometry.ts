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

/**
 * Whether a point falls inside an area geometry — the client-side half of the
 * region filter.
 *
 * Not every explorer narrows its list through the server: the address book and
 * the service-request list are built from rows already synced to the browser, so
 * "is this record inside the selected region" has to be answerable locally. Both
 * hold point records, and this answers the same question PostGIS answers for the
 * tile-backed explorers.
 *
 * Points on the boundary count as inside, matching `ST_Intersects` — a record
 * sitting exactly on a district line should not vanish from both districts.
 * Non-area geometries hold nothing, so they return false.
 */
export function geometryContainsLngLat(geometry: GeoJsonGeometry, point: LngLat): boolean {
	if (geometry.type === 'Polygon') {
		return polygonContainsLngLat(geometry.coordinates, point);
	}
	if (geometry.type === 'MultiPolygon') {
		return geometry.coordinates.some((polygon) => polygonContainsLngLat(polygon, point));
	}
	return false;
}

/** Inside the outer ring, and not inside any hole punched out of it. */
function polygonContainsLngLat(
	rings: readonly (readonly GeoJsonPosition[])[],
	point: LngLat,
): boolean {
	const outer = rings[0];
	if (outer === undefined) {
		return false;
	}
	if (isOnRing(outer, point)) {
		return true;
	}
	if (!isInsideRing(outer, point)) {
		return false;
	}
	for (const hole of rings.slice(1)) {
		// A hole's edge is still the polygon's boundary, so it stays inside.
		if (isOnRing(hole, point)) {
			return true;
		}
		if (isInsideRing(hole, point)) {
			return false;
		}
	}
	return true;
}

/** Even-odd ray casting: count the ring crossings due west of the point. */
function isInsideRing(ring: readonly GeoJsonPosition[], point: LngLat): boolean {
	let inside = false;
	for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
		const current = ring[index];
		const last = ring[previous];
		if (current === undefined || last === undefined) {
			continue;
		}
		const [currentLng, currentLat] = current;
		const [lastLng, lastLat] = last;
		if (currentLat > point.lat !== lastLat > point.lat) {
			const crossingLng =
				((lastLng - currentLng) * (point.lat - currentLat)) / (lastLat - currentLat) + currentLng;
			if (point.lng < crossingLng) {
				inside = !inside;
			}
		}
	}
	return inside;
}

// Degrees, so this is a tolerance of well under a millimetre on the ground —
// enough to absorb the rounding of a coordinate that round-tripped through JSON.
const onEdgeEpsilon = 1e-12;

function isOnRing(ring: readonly GeoJsonPosition[], point: LngLat): boolean {
	for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
		const current = ring[index];
		const last = ring[previous];
		if (current === undefined || last === undefined) {
			continue;
		}
		if (isOnSegment(last, current, point)) {
			return true;
		}
	}
	return false;
}

function isOnSegment(start: GeoJsonPosition, end: GeoJsonPosition, point: LngLat): boolean {
	const [startLng, startLat] = start;
	const [endLng, endLat] = end;
	const cross =
		(point.lng - startLng) * (endLat - startLat) - (point.lat - startLat) * (endLng - startLng);
	if (Math.abs(cross) > onEdgeEpsilon) {
		return false;
	}
	return (
		point.lng >= Math.min(startLng, endLng) - onEdgeEpsilon &&
		point.lng <= Math.max(startLng, endLng) + onEdgeEpsilon &&
		point.lat >= Math.min(startLat, endLat) - onEdgeEpsilon &&
		point.lat <= Math.max(startLat, endLat) + onEdgeEpsilon
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
 * drawn GeoJSON geometry for an optimistic write. Follows the database
 * `set_owned_centroid()` trigger for every shape but the two linear ones:
 * geomType uses the lowercased PostGIS `ST_*` form (e.g. `st_point`) so the
 * optimistic row matches the synced row. Returns null for empty/degenerate
 * geometry.
 *
 * Areal geometry is area-weighted, holes subtracted and parts weighted by their
 * own area, which is what `st_centroid` computes. `centroidFromGeoJson` averages
 * vertices and the two already disagreed for any polygon with uneven vertex
 * spacing. Multipart is what makes that visible: a MultiPolygon with one large
 * part and one small distant part puts a vertex-averaged marker between them,
 * and it jumps when Electric confirms the row.
 *
 * Points and MultiPoints agree with `st_centroid` on the average. **Lines do
 * not, and that is a known gap rather than a decision this file can defend.**
 * `st_centroid` weights a LineString by segment length, so a line with uneven
 * spacing gets an optimistic marker that moves on confirmation, and a
 * MultiLineString with one long part and one short distant part moves further.
 * ADR 0018 kept the average for lines on the belief that PostGIS averages them
 * too, which it does not. Nothing guards it: the integration test filters the
 * linear shapes out.
 *
 * `owned-geometry.integration.test.ts` runs the corpus through `st_centroid` and
 * is what holds the areal half here to PostGIS rather than to hand-computed
 * numbers.
 */
export function ownedCentroidFromGeoJson(geometry: GeoJsonGeometry): OwnedCentroid | null {
	const centroid = arealCentroid(geometry) ?? centroidFromGeoJson(geometry);
	if (centroid === null) return null;
	return {
		lat: centroid.lat,
		lng: centroid.lng,
		geomType: `st_${geometry.type.toLowerCase()}`,
	};
}

/**
 * The area-weighted centroid of a Polygon or a MultiPolygon, by the shoelace
 * formula on raw degrees.
 *
 * Null for every other shape, and null again when the total area is zero, which
 * hands the caller back the vertex average. A zero-area polygon has no
 * area-weighted centroid to compute, and the write path refuses one anyway: ADR
 * 0018 says a stored geometry must cover ground.
 *
 * Ring winding is not read. GeoJSON does not guarantee it, so each ring
 * contributes the magnitude of its own area, ring 0 adding and the rest
 * subtracting, which is the hole rule stated as arithmetic rather than as a
 * winding convention.
 */
function arealCentroid(geometry: GeoJsonGeometry): LngLat | null {
	if (geometry.type === 'Polygon') return polygonMoments(geometry.coordinates).centroid;
	if (geometry.type !== 'MultiPolygon') return null;

	let lng = 0;
	let lat = 0;
	let area = 0;
	for (const part of geometry.coordinates) {
		const moments = polygonMoments(part);
		if (moments.centroid === null) continue;
		lng += moments.centroid.lng * moments.area;
		lat += moments.centroid.lat * moments.area;
		area += moments.area;
	}
	return area === 0 ? null : { lng: lng / area, lat: lat / area };
}

interface PolygonMoments {
	readonly centroid: LngLat | null;
	/** Net of the holes. */
	readonly area: number;
}

function polygonMoments(rings: readonly (readonly GeoJsonPosition[])[]): PolygonMoments {
	let lng = 0;
	let lat = 0;
	let area = 0;
	rings.forEach((ring, index) => {
		const moments = ringMoments(ring);
		if (moments === null || moments.twiceArea === 0) return;
		const sign = index === 0 ? 1 : -1;
		const ringArea = Math.abs(moments.twiceArea) / 2;
		lng += sign * ringArea * (moments.origin[0] + moments.lng / (3 * moments.twiceArea));
		lat += sign * ringArea * (moments.origin[1] + moments.lat / (3 * moments.twiceArea));
		area += sign * ringArea;
	});
	return area === 0
		? { centroid: null, area: 0 }
		: { centroid: { lng: lng / area, lat: lat / area }, area };
}

interface RingMoments {
	readonly origin: GeoJsonPosition;
	readonly twiceArea: number;
	readonly lng: number;
	readonly lat: number;
}

/**
 * The shoelace sums for one ring, taken about its first vertex.
 *
 * The translation is not a nicety. Every cross product is a difference of terms
 * near 2,700 (longitude 90 by latitude 30) and the sum of them is the area of a
 * treatment block, so an untranslated shoelace loses ten digits to cancellation
 * and lands the centroid a few centimetres from where `st_centroid` puts it.
 * GEOS translates for the same reason.
 */
function ringMoments(ring: readonly GeoJsonPosition[]): RingMoments | null {
	const origin = ring[0];
	if (origin === undefined) return null;

	let twiceArea = 0;
	let lng = 0;
	let lat = 0;
	for (let index = 0; index < ring.length; index += 1) {
		const current = ring[index];
		const next = ring[(index + 1) % ring.length];
		if (current === undefined || next === undefined) continue;
		const x0 = current[0] - origin[0];
		const y0 = current[1] - origin[1];
		const x1 = next[0] - origin[0];
		const y1 = next[1] - origin[1];
		const cross = x0 * y1 - x1 * y0;
		twiceArea += cross;
		lng += (x0 + x1) * cross;
		lat += (y0 + y1) * cross;
	}
	return { origin, twiceArea, lng, lat };
}

/**
 * Normalize a stored geometry type to its bare GeoJSON-ish form. Owned-geometry
 * columns hold the lowercased PostGIS `ST_*` name (`st_polygon`), while GeoJSON
 * objects carry `Polygon` — both normalize to `polygon`.
 */
export function normalizeGeomType(value: string): string {
	return value
		.trim()
		.toLowerCase()
		.replace(/^st_?/, '')
		.replace(/[_\s]+/g, '');
}

/**
 * True when the centroid *is* the shape, which is Point and nothing else.
 *
 * The rule is total over all six shapes. A MultiPoint's centroid stands in for a
 * set of separated basins, both line types' for a run of ground, and both
 * polygon types' for an area, so every one of the other five has a shape the
 * marker only represents. That is why there is no `isArealGeomType` beside this:
 * an areal-versus-point split has no correct answer for MultiPoint, and no
 * TypeScript caller asks the question anyway.
 */
export function isPointGeomType(value: string | null | undefined): boolean {
	return value != null && normalizeGeomType(value) === 'point';
}

/**
 * Human label for a stored geometry type — `st_linestring` reads as "Line".
 * Unrecognized values pass through so an unexpected type is visible rather than
 * silently relabelled.
 */
export function formatGeometryTypeLabel(value: string): string {
	switch (normalizeGeomType(value)) {
		case 'point':
			return 'Point';
		case 'multipoint':
			return 'Multi-point';
		case 'linestring':
			return 'Line';
		case 'multilinestring':
			return 'Multi-line';
		case 'polygon':
			return 'Polygon';
		case 'multipolygon':
			return 'Multi-polygon';
		case 'geometrycollection':
			return 'Geometry collection';
		default:
			return value.trim() === '' ? 'Unknown geometry' : value;
	}
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

const EARTH_RADIUS_METERS = 6_378_137;

/**
 * A closed geodesic circle polygon of `steps` segments centered on `center` with
 * the given radius in meters — e.g. a proximity ring around a record. Uses a
 * spherical destination-point formula, so it stays round at any latitude rather
 * than the squashed ellipse a naive degrees offset produces.
 */
export function circlePolygon(center: LngLat, radiusMeters: number, steps = 64): GeoJsonPolygon {
	const segments = Math.max(8, Math.floor(steps));
	const latRad = (center.lat * Math.PI) / 180;
	const lngRad = (center.lng * Math.PI) / 180;
	const angular = radiusMeters / EARTH_RADIUS_METERS;
	const ring: [number, number][] = [];

	for (let index = 0; index <= segments; index += 1) {
		const bearing = (index / segments) * 2 * Math.PI;
		const lat2 = Math.asin(
			Math.sin(latRad) * Math.cos(angular) +
				Math.cos(latRad) * Math.sin(angular) * Math.cos(bearing),
		);
		const lng2 =
			lngRad +
			Math.atan2(
				Math.sin(bearing) * Math.sin(angular) * Math.cos(latRad),
				Math.cos(angular) - Math.sin(latRad) * Math.sin(lat2),
			);
		ring.push([(lng2 * 180) / Math.PI, (lat2 * 180) / Math.PI]);
	}

	return { type: 'Polygon', coordinates: [ring] };
}
