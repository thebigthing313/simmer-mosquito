/**
 * The ring arithmetic behind editing a committed part: which vertex or edge a
 * gesture names, and what moving, inserting or removing one does to the rings.
 *
 * Positions and nothing else. A part is rings plus a shape, and the shape half
 * stays in the draw control, so everything here can be read and tested without
 * a map, a record kind, or a geometry type.
 *
 * Beside {@link reshapePath} and {@link splitRings} because it is the same
 * decision: ADR 0018's parts and holes are added and removed by these
 * operations and reshaped by those, over the one pair type and the one
 * tolerance {@link samePlanarPosition} reads.
 */

import { type PlanarPath, type PlanarPosition, samePlanarPosition } from './sketch.js';

/**
 * Which vertex a gesture is aimed at.
 *
 * Ring 0 is the outline and every ring after it is a hole, which is how a
 * polygon stores them. An edge is named by the vertex it starts at, so one pair
 * points at either and there is no second reference type to keep in step.
 */
export interface DrawVertexRef {
	readonly ring: number;
	readonly vertex: number;
}

/** `ring` with its first position repeated at the end, unless it already is. */
export function closeRing(ring: PlanarPath): PlanarPath {
	const first = ring[0];
	const last = ring.at(-1);
	if (first === undefined || last === undefined) {
		return ring;
	}
	return first[0] === last[0] && first[1] === last[1] ? ring : [...ring, first];
}

/**
 * `ring` with its repeated closing position dropped, so every entry left is a
 * corner somebody placed.
 *
 * The drop is conditional because closure is: a ring adopted from a file or a
 * region is only closed if whoever wrote it closed it, and slicing one that is
 * not would lose a real corner.
 */
export function unclosedRing(ring: PlanarPath): PlanarPath {
	const closed = ring.length > 1 && samePlanarPosition(ring[0], ring.at(-1));
	return closed ? ring.slice(0, -1) : ring;
}

/** `rings` with one vertex moved, or null when no ring holds it. */
export function moveRingVertex(
	rings: readonly PlanarPath[],
	ref: DrawVertexRef,
	position: PlanarPosition,
): readonly PlanarPath[] | null {
	const ring = rings[ref.ring];
	if (ring === undefined || ring[ref.vertex] === undefined) {
		return null;
	}
	return replaceRing(
		rings,
		ref.ring,
		ring.map((at, index) => (index === ref.vertex ? position : at)),
	);
}

/**
 * `rings` with `position` put between the vertex `edge` names and the one after
 * it, or null when no ring holds that edge.
 *
 * The last vertex of an area's ring names the edge that closes it, so a position
 * on that edge lands at the end. Nothing else about the order changes, which is
 * what leaves the ring wound the way it was drawn.
 */
export function insertRingVertex(
	rings: readonly PlanarPath[],
	edge: DrawVertexRef,
	position: PlanarPosition,
): readonly PlanarPath[] | null {
	const ring = rings[edge.ring];
	if (ring === undefined || ring[edge.vertex] === undefined) {
		return null;
	}
	return replaceRing(rings, edge.ring, [
		...ring.slice(0, edge.vertex + 1),
		position,
		...ring.slice(edge.vertex + 1),
	]);
}

/**
 * The fewest positions a ring is taken down to, which is the fewest that still
 * draw an edge.
 *
 * An edge is the only way to put a vertex back, so a ring below two is a draft
 * only Undo and Cancel can leave. Dropping a ring whole is `removeHole`, and a
 * whole piece is `removePart`.
 */
const RING_FLOOR = 2;

/**
 * `rings` with one vertex dropped, or null when no ring holds it, or when that
 * ring is already at {@link RING_FLOOR}.
 *
 * Below the three an area needs is allowed on purpose: the draft says it cannot
 * be finished and recovers the moment a vertex comes back.
 */
export function removeRingVertex(
	rings: readonly PlanarPath[],
	ref: DrawVertexRef,
): readonly PlanarPath[] | null {
	const ring = rings[ref.ring];
	if (ring === undefined || ring[ref.vertex] === undefined || ring.length <= RING_FLOOR) {
		return null;
	}
	return replaceRing(
		rings,
		ref.ring,
		ring.filter((_, index) => index !== ref.vertex),
	);
}

/**
 * The edge of `rings` nearest `position`, named by the vertex it starts at, or
 * null when there is no edge to land on.
 *
 * `closesRings` says whether the last vertex of a ring runs back to its first,
 * which an area does and a line does not. Distance is in degrees rather than
 * pixels: the caller has already decided the pointer is on the shape, so all
 * this settles is which edge it was nearest.
 */
export function nearestRingEdge(
	rings: readonly PlanarPath[],
	position: PlanarPosition,
	closesRings: boolean,
): DrawVertexRef | null {
	let nearest: DrawVertexRef | null = null;
	let shortest = Number.POSITIVE_INFINITY;
	rings.forEach((ring, ringIndex) => {
		const edges = closesRings ? ring.length : ring.length - 1;
		for (let index = 0; index < edges; index += 1) {
			const from = ring[index];
			const to = ring[(index + 1) % ring.length];
			if (from === undefined || to === undefined) {
				continue;
			}
			const distance = squaredDistanceToSegment(position, from, to);
			if (distance < shortest) {
				shortest = distance;
				nearest = { ring: ringIndex, vertex: index };
			}
		}
	});
	return nearest;
}

/**
 * Whether `ring` holds at least `minimum` positions no two of which are the same
 * corner.
 *
 * Distinct rather than counted, because three clicks in one spot are three
 * positions and no area at all. It stops as soon as it has `minimum` of them, so
 * a ring read out of a file is not compared with itself position by position.
 */
export function hasDistinctPositions(ring: PlanarPath, minimum: number): boolean {
	const distinct: PlanarPosition[] = [];
	for (const position of ring) {
		if (!distinct.some((earlier) => samePlanarPosition(earlier, position))) {
			distinct.push(position);
			if (distinct.length >= minimum) {
				return true;
			}
		}
	}
	return distinct.length >= minimum;
}

function replaceRing(
	rings: readonly PlanarPath[],
	index: number,
	ring: PlanarPath,
): readonly PlanarPath[] {
	return rings.map((at, position) => (position === index ? ring : at));
}

/**
 * How far `point` is from the segment running `from` to `to`, squared.
 *
 * Squared because only the comparison matters, and the square root would be
 * taken once per edge of every ring on screen for an answer nothing reads.
 */
function squaredDistanceToSegment(
	point: PlanarPosition,
	from: PlanarPosition,
	to: PlanarPosition,
): number {
	const runX = to[0] - from[0];
	const runY = to[1] - from[1];
	const lengthSquared = runX * runX + runY * runY;
	const along =
		lengthSquared === 0
			? 0
			: Math.max(
					0,
					Math.min(1, ((point[0] - from[0]) * runX + (point[1] - from[1]) * runY) / lengthSquared),
				);
	const offX = from[0] + along * runX - point[0];
	const offY = from[1] + along * runY - point[1];
	return offX * offX + offY * offY;
}
