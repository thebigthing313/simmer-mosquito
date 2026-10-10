import { closeRing, type PlanarPath, type PlanarPosition } from '@simmer-mosquito/mapping';
import type { DrawPartGeometry } from '../../../../components/map/draw-parts';

/*
 * The shapes the draw suites share: the machine, the part algebra,
 * `buildFeatures` and the `useMapDraw` hook all draw on the same block, so a
 * coordinate asserted in one suite is the coordinate asserted in the others.
 * Nothing here imports React or Mapbox, because the machine's suite runs with
 * no jsdom and no fake map.
 */

export const FIRST_TRIANGLE: readonly PlanarPosition[] = [
	[-90, 35],
	[-90, 36],
	[-89, 36],
];
export const SECOND_TRIANGLE: readonly PlanarPosition[] = [
	[-80, 35],
	[-80, 36],
	[-79, 36],
];
/** On {@link FIRST_TRIANGLE}'s first leg, between its first two corners. */
export const ON_FIRST_LEG: PlanarPosition = [-90, 35.5];
/** {@link FIRST_TRIANGLE} with {@link ON_FIRST_LEG} inserted as its second corner. */
export const TRIANGLE_WITH_LEG_VERTEX: readonly PlanarPosition[] = [
	[-90, 35],
	ON_FIRST_LEG,
	[-90, 36],
	[-89, 36],
];
/** A four-corner area with room inside it, so a hole has somewhere to go. */
export const BLOCK: readonly PlanarPosition[] = [
	[-91, 34],
	[-91, 37],
	[-88, 37],
	[-88, 34],
];
/** On {@link BLOCK}'s western edge, between its first two corners. */
export const ON_WEST_EDGE: PlanarPosition = [-91, 35.5];
/** {@link BLOCK} with {@link ON_WEST_EDGE} inserted as its second corner. */
export const BLOCK_WITH_EDGE_VERTEX: readonly PlanarPosition[] = [
	[-91, 34],
	ON_WEST_EDGE,
	[-91, 37],
	[-88, 37],
	[-88, 34],
];
/** Where {@link BLOCK}'s third corner is dragged to, north-east of the block. */
export const PULLED_CORNER: PlanarPosition = [-87, 38];
/** {@link BLOCK} with its third corner at {@link PULLED_CORNER}. */
export const BLOCK_WITH_PULLED_CORNER: readonly PlanarPosition[] = [
	[-91, 34],
	[-91, 37],
	PULLED_CORNER,
	[-88, 34],
];
/** Well inside {@link BLOCK}. */
export const POND: readonly PlanarPosition[] = [
	[-90, 35],
	[-90, 36],
	[-89, 36],
	[-89, 35],
];
/** Two corners inside {@link BLOCK} and two outside its eastern edge. */
export const ESCAPING_POND: readonly PlanarPosition[] = [
	[-89, 35],
	[-89, 36],
	[-85, 36],
	[-85, 35],
];
/** A line crossing {@link BLOCK}'s northern edge twice, drawn north of it. */
export const OUTSIDE_SKETCH: readonly PlanarPosition[] = [
	[-90.5, 36],
	[-90.5, 38],
	[-89.5, 38],
	[-89.5, 36],
];
/** {@link BLOCK} with {@link OUTSIDE_SKETCH} taken into its northern edge. */
export const BULGED_BLOCK: readonly PlanarPosition[] = [
	[-90.5, 37],
	[-90.5, 38],
	[-89.5, 38],
	[-89.5, 37],
	[-88, 37],
	[-88, 34],
	[-91, 34],
	[-91, 37],
];
/** A line straight down the middle of {@link BLOCK}, out both sides. */
export const ACROSS_BLOCK: readonly PlanarPosition[] = [
	[-89.5, 33],
	[-89.5, 38],
];

/** A polygon over `rings`, each closed the way a stored ring is. */
export function polygon(...rings: readonly PlanarPath[]): DrawPartGeometry {
	return { type: 'Polygon', coordinates: rings.map(closeRing) };
}

/** A line through `positions`, left open between the last and the first. */
export function line(positions: PlanarPath): DrawPartGeometry {
	return { type: 'LineString', coordinates: positions };
}
