/**
 * Measuring ground distance and area from map coordinates.
 *
 * Kept here rather than in the map component because none of it is about
 * Mapbox: it is spherical trigonometry over `LngLat`, and it is the part worth
 * testing. A mosquito control district sizes a treatment area, checks how far a
 * route stop is from standing water, or works out the perimeter of a marsh —
 * numbers that inform a pesticide rate, so being wrong at the third decimal is
 * not the same as being wrong by a factor of ten.
 *
 * Everything is computed on a sphere. Over the distances an organization
 * measures — a parcel, a marsh, a service area — the difference from a proper
 * ellipsoidal calculation is well under a tenth of a percent, and the formulae
 * stay short enough to read.
 */

import type { GeoJsonPolygon, LngLat } from './geometry.js';

/**
 * Mean Earth radius, the value used for spherical distance.
 *
 * Deliberately *not* the equatorial radius `circlePolygon` uses: that function
 * draws a shape and wants the value that keeps it round on a Web Mercator map,
 * while this one answers "how far is it" and wants the radius that minimises
 * error over a whole sphere.
 */
const MEAN_EARTH_RADIUS_METERS = 6_371_008.8;

const DEGREES_TO_RADIANS = Math.PI / 180;

/** Great-circle distance between two points, in metres. */
export function distanceMeters(from: LngLat, to: LngLat): number {
	const fromLat = from.lat * DEGREES_TO_RADIANS;
	const toLat = to.lat * DEGREES_TO_RADIANS;
	const deltaLat = (to.lat - from.lat) * DEGREES_TO_RADIANS;
	const deltaLng = (to.lng - from.lng) * DEGREES_TO_RADIANS;

	// Haversine rather than the spherical law of cosines: the latter loses
	// precision on short distances, which is most of what gets measured here.
	const a =
		Math.sin(deltaLat / 2) ** 2 + Math.cos(fromLat) * Math.cos(toLat) * Math.sin(deltaLng / 2) ** 2;
	return 2 * MEAN_EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Total length along a path, in metres. Zero for fewer than two points. */
export function pathLengthMeters(points: readonly LngLat[]): number {
	let total = 0;
	for (let index = 1; index < points.length; index += 1) {
		const previous = points[index - 1];
		const current = points[index];
		if (previous !== undefined && current !== undefined) {
			total += distanceMeters(previous, current);
		}
	}
	return total;
}

/**
 * The area a closed ring encloses, in square metres.
 *
 * Uses the spherical excess of the polygon rather than a planar shoelace, so a
 * shape does not shrink as it moves away from the equator — a district at 45°
 * would read about 30% small on a naive degrees-based calculation.
 *
 * Sign is discarded: winding order is a data convention, not a fact about how
 * much ground the shape covers.
 */
export function ringAreaMeters(ring: readonly LngLat[]): number {
	const closed = withoutRepeatedEnd(ring);
	if (closed.length < 3) {
		return 0;
	}

	let total = 0;
	for (let index = 0; index < closed.length; index += 1) {
		const current = closed[index];
		const next = closed[(index + 1) % closed.length];
		if (current === undefined || next === undefined) {
			continue;
		}
		total +=
			(next.lng - current.lng) *
			DEGREES_TO_RADIANS *
			(2 + Math.sin(current.lat * DEGREES_TO_RADIANS) + Math.sin(next.lat * DEGREES_TO_RADIANS));
	}

	return Math.abs((total * MEAN_EARTH_RADIUS_METERS * MEAN_EARTH_RADIUS_METERS) / 2);
}

/** The distance around a closed ring, in metres. */
export function ringPerimeterMeters(ring: readonly LngLat[]): number {
	const closed = withoutRepeatedEnd(ring);
	return closed.length < 2 ? 0 : pathLengthMeters([...closed, closed[0] as LngLat]);
}

/**
 * Area of a polygon, in square metres: the outer ring less any holes.
 *
 * The shapes this module measures are drawn by hand and never have holes, but
 * the subtraction costs one loop and means a polygon that arrived from a file
 * import is not silently overstated.
 */
export function polygonAreaMeters(polygon: GeoJsonPolygon): number {
	const [outer, ...holes] = polygon.coordinates.map(toRing);
	if (outer === undefined) {
		return 0;
	}
	return holes.reduce((area, hole) => area - ringAreaMeters(hole), ringAreaMeters(outer));
}

/** Perimeter of a polygon's outer ring, in metres. Holes are not walls. */
export function polygonPerimeterMeters(polygon: GeoJsonPolygon): number {
	const outer = polygon.coordinates[0];
	return outer === undefined ? 0 : ringPerimeterMeters(toRing(outer));
}

/**
 * The axis-aligned rectangle spanned by two opposite corners.
 *
 * "Axis-aligned" means aligned to the graticule, which is what a user dragging
 * a box on a north-up map expects. The result is a closed ring wound
 * counter-clockwise, so it can be handed to anything that wants GeoJSON.
 */
export function rectanglePolygon(from: LngLat, to: LngLat): GeoJsonPolygon {
	const west = Math.min(from.lng, to.lng);
	const east = Math.max(from.lng, to.lng);
	const south = Math.min(from.lat, to.lat);
	const north = Math.max(from.lat, to.lat);

	return {
		type: 'Polygon',
		coordinates: [
			[
				[west, south],
				[east, south],
				[east, north],
				[west, north],
				[west, south],
			],
		],
	};
}

// ---------------------------------------------------------------------------
// Display
// ---------------------------------------------------------------------------

/**
 * Which units to read a measurement back in.
 *
 * `us` because SIMMER's v1 organizations are US districts, who size treatment
 * areas in acres and talk about swath width in feet. `metric` is here because
 * the science half of the same work — larval densities, application rates — is
 * metric, and an organization should be able to pick.
 */
export type MeasurementSystem = 'us' | 'metric';

const FEET_PER_METER = 3.280_839_895;
/** Exact by definition, and the value the mile threshold is compared against. */
const METERS_PER_MILE = 1609.344;
const SQUARE_METERS_PER_ACRE = 4046.856_422_4;
const SQUARE_METERS_PER_SQUARE_MILE = 2_589_988.110_336;
const SQUARE_METERS_PER_HECTARE = 10_000;

/**
 * A distance, in the largest unit that keeps the number readable.
 *
 * The threshold is where the smaller unit starts needing five digits — a
 * quarter-mile reads better as "1,320 ft" than as "0.25 mi", and ten miles
 * reads better than fifty-three thousand feet.
 */
export function formatDistance(meters: number, system: MeasurementSystem = 'us'): string {
	if (!Number.isFinite(meters) || meters <= 0) {
		return system === 'us' ? '0 ft' : '0 m';
	}

	if (system === 'metric') {
		return meters < 1000
			? `${round(meters, meters < 100 ? 1 : 0)} m`
			: `${round(meters / 1000, 2)} km`;
	}

	// The threshold is checked in metres, not in the converted feet: one mile is
	// 5279.999… feet after the round trip through `FEET_PER_METER`, so comparing
	// there would print "5,280 ft" for a distance that is exactly a mile.
	if (meters >= METERS_PER_MILE) {
		return `${round(meters / METERS_PER_MILE, 2)} mi`;
	}
	const feet = meters * FEET_PER_METER;
	return `${round(feet, feet < 100 ? 1 : 0)} ft`;
}

/**
 * An area, in the unit an organization would actually write down.
 *
 * Acres for anything a crew treats, square miles once it is district-scale.
 * Small areas stay in square feet rather than becoming "0.01 acres", which
 * carries no information.
 */
export function formatArea(squareMeters: number, system: MeasurementSystem = 'us'): string {
	if (!Number.isFinite(squareMeters) || squareMeters <= 0) {
		return system === 'us' ? '0 ft²' : '0 m²';
	}

	if (system === 'metric') {
		if (squareMeters < SQUARE_METERS_PER_HECTARE) {
			return `${round(squareMeters, squareMeters < 100 ? 1 : 0)} m²`;
		}
		const hectares = squareMeters / SQUARE_METERS_PER_HECTARE;
		return hectares < 100 ? `${round(hectares, 2)} ha` : `${round(hectares / 100, 2)} km²`;
	}

	const squareFeet = squareMeters * FEET_PER_METER * FEET_PER_METER;
	if (squareMeters < SQUARE_METERS_PER_ACRE / 10) {
		return `${round(squareFeet, 0)} ft²`;
	}
	const acres = squareMeters / SQUARE_METERS_PER_ACRE;
	return acres < 640
		? `${round(acres, 2)} acres`
		: `${round(squareMeters / SQUARE_METERS_PER_SQUARE_MILE, 2)} sq mi`;
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function toRing(positions: readonly (readonly number[])[]): readonly LngLat[] {
	return positions.flatMap((position) => {
		const [lng, lat] = position;
		return lng === undefined || lat === undefined ? [] : [{ lng, lat }];
	});
}

/**
 * A GeoJSON ring repeats its first point at the end; the area and perimeter
 * loops close the ring themselves, so counting it twice would add a zero-length
 * segment and one spurious term.
 */
function withoutRepeatedEnd(ring: readonly LngLat[]): readonly LngLat[] {
	const first = ring[0];
	const last = ring[ring.length - 1];
	if (ring.length > 1 && first !== undefined && last !== undefined) {
		if (first.lng === last.lng && first.lat === last.lat) {
			return ring.slice(0, -1);
		}
	}
	return ring;
}

function round(value: number, decimals: number): string {
	return value.toLocaleString('en-US', {
		minimumFractionDigits: decimals,
		maximumFractionDigits: decimals,
	});
}
