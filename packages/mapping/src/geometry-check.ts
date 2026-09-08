import type { GeoJsonGeometry, GeoJsonGeometryType, GeoJsonPosition } from './geometry.js';

/**
 * Whether an unknown value is one of the GeoJSON shapes a caller will accept.
 *
 * The render seam's narrowing half. Every geometry the app draws arrives as a
 * JSON column parsed out of an HTTP body, and the eight places that read one
 * used to say `as GeoJsonGeometry` over the parse. That cast is a claim rather
 * than a guarantee: a null, a string, or a `GeometryCollection` satisfied it, and
 * Mapbox drops a malformed feature without an error, so a record with the wrong
 * shape drew as an empty map with nothing on screen to say why.
 *
 * The allowed shapes are a parameter rather than a list held here. Which record
 * kind stores which shapes is `OWNED_GEOMETRY_POLICIES` in `packages/domain`,
 * and this package has no dependency on that one: a provider-neutral geometry
 * package taking an edge to the domain package to type six string names is the
 * worse trade, and `check:geometry-policies` refuses a second copy of the list
 * anyway. So the caller reads the register and passes what it read, the same way
 * `packages/sync` takes the command vocabulary as a type argument rather than
 * importing it.
 *
 * It answers about the value and hands back nothing. That is deliberate and it
 * is load-bearing: `useGeoJsonSource` holds its `data` in an effect dependency,
 * so a check that returned a copy would re-add the Mapbox source on every
 * render. A predicate keeps the same reference.
 *
 * The coordinate half is the part a type cannot state. A shape with a `type` the
 * caller allows and coordinates that are not positions still passes a cast and
 * still draws nothing, so the counts are checked against what GeoJSON requires:
 * a line needs two positions, a polygon ring needs four, and every position is a
 * pair or triple of finite numbers. Whether a ring encloses area is not asked
 * here, because that is a rule about what may be stored and the write path is
 * where it is enforced; this is the last check before a value reaches a
 * renderer, and refusing a stored record the server accepted would hide it.
 */
export function isGeoJsonGeometryOfTypes<Type extends GeoJsonGeometryType>(
	value: unknown,
	allowedTypes: readonly Type[],
): value is Extract<GeoJsonGeometry, { readonly type: Type }> {
	if (typeof value !== 'object' || value === null) {
		return false;
	}
	const candidate = value as { readonly type?: unknown; readonly coordinates?: unknown };
	const type = candidate.type;
	if (typeof type !== 'string') {
		return false;
	}
	const allowed: readonly string[] = allowedTypes;
	if (!allowed.includes(type)) {
		return false;
	}
	const holdsCoordinates = COORDINATE_SHAPE[type as GeoJsonGeometryType];
	return holdsCoordinates?.(candidate.coordinates) === true;
}

/**
 * What each shape's `coordinates` has to be, keyed by the shape.
 *
 * An object keyed by the type union rather than a list of names, so the compiler
 * requires an entry per shape and a shape added to the union cannot quietly miss
 * one. It is also the form `check:geometry-policies` blesses, for that reason.
 */
const COORDINATE_SHAPE: Readonly<Record<GeoJsonGeometryType, (coordinates: unknown) => boolean>> = {
	Point: (coordinates) => isPosition(coordinates),
	MultiPoint: (coordinates) => isPositionList(coordinates, 1),
	LineString: (coordinates) => isPositionList(coordinates, 2),
	MultiLineString: (coordinates) => isListOf(coordinates, (part) => isPositionList(part, 2)),
	Polygon: (coordinates) => isRingList(coordinates),
	MultiPolygon: (coordinates) => isListOf(coordinates, isRingList),
};

function isPosition(value: unknown): value is GeoJsonPosition {
	if (!Array.isArray(value) || value.length < 2 || value.length > 3) {
		return false;
	}
	return value.every((part) => typeof part === 'number' && Number.isFinite(part));
}

function isPositionList(value: unknown, minimum: number): boolean {
	return Array.isArray(value) && value.length >= minimum && value.every(isPosition);
}

/**
 * A polygon's rings. Four positions is the GeoJSON floor for a closed ring, and
 * PostGIS closes every ring it writes, so nothing stored falls under it.
 */
function isRingList(value: unknown): boolean {
	return isListOf(value, (ring) => isPositionList(ring, 4));
}

function isListOf(value: unknown, holds: (part: unknown) => boolean): boolean {
	return Array.isArray(value) && value.length >= 1 && value.every(holds);
}
