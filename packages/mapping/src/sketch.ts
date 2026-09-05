/**
 * Sketching a line across a ring or a line, and what the stretch between the
 * sketch's first and last crossing is replaced by.
 *
 * Hand-written and dependency-free, which is the whole reason it is here rather
 * than in the draw control: `packages/mapping` takes no geometry library, and
 * ADR 0018's children share one segment-intersection routine rather than each
 * carrying a copy. Split (#497) reads {@link sketchCrossings} for the same
 * crossings reshape reads.
 *
 * Planar, on raw degrees. Two segments a few hundred metres apart cross at the
 * same position whether the arithmetic is planar or spherical, and the draw
 * control already picks its nearest edge the same way. Nothing here reports a
 * distance, so metres are not the unit of any answer it gives.
 */

/**
 * One position: longitude, then latitude.
 *
 * Its own pair type rather than `GeoJsonPosition`, which admits an altitude.
 * Everything here computes new positions from old ones, and a third ordinate
 * would have to be either interpolated, which invents an elevation, or dropped
 * silently on the positions that keep it.
 */
export type PlanarPosition = readonly [number, number];

/** A ring or a line, in stored order, with no repeated closing position. */
export type PlanarPath = readonly PlanarPosition[];

/**
 * Where a sketch meets the path it was drawn across.
 *
 * Both halves are named the same way, by the edge the crossing sits on and how
 * far along that edge it is, so ordering along the sketch and ordering along the
 * path are the same comparison read from two fields.
 */
export interface SketchCrossing {
	readonly position: PlanarPosition;
	/** The sketch segment it lies on, and how far along that segment, 0 to 1. */
	readonly sketchEdge: number;
	readonly sketchOffset: number;
	/** The path edge it lies on, and how far along that edge, 0 to 1. */
	readonly pathEdge: number;
	readonly pathOffset: number;
}

/** Why a sketch cannot reshape the path it was drawn across. */
export type ReshapeRefusal = 'tooFewCrossings';

/** The reshaped path, or the reason there is not one. */
export type ReshapeOutcome =
	| { readonly kind: 'reshaped'; readonly path: PlanarPath }
	| { readonly kind: 'refused'; readonly refusal: ReshapeRefusal };

/** How close two positions have to be to count as the same one. */
const EPSILON = 1e-9;

/**
 * Every crossing of `sketch` over `path`, in the order the sketch makes them.
 *
 * `closed` says whether the path's last position runs back to its first, which
 * a ring does and a line does not.
 *
 * A crossing at a shared position is reported once. A sketch vertex landing
 * exactly on the path is found by the two sketch segments that meet there, and a
 * path vertex sitting on the sketch is found by the two path edges that meet
 * there, so without the drop a single touch would read as two crossings and a
 * sketch that touches once would look like it had crossed twice.
 *
 * A sketch segment lying along a path edge is not a crossing. It has no single
 * position to name, and a sketch traced over the boundary is not a reshape.
 */
export function sketchCrossings(
	path: PlanarPath,
	sketch: PlanarPath,
	closed: boolean,
): readonly SketchCrossing[] {
	const edges = closed ? path.length : path.length - 1;
	const found: SketchCrossing[] = [];
	for (let sketchEdge = 0; sketchEdge + 1 < sketch.length; sketchEdge += 1) {
		const from = sketch[sketchEdge];
		const to = sketch[sketchEdge + 1];
		if (from === undefined || to === undefined) {
			continue;
		}
		const onSegment: SketchCrossing[] = [];
		for (let pathEdge = 0; pathEdge < edges; pathEdge += 1) {
			const start = path[pathEdge];
			const end = path[(pathEdge + 1) % path.length];
			const hit = start === undefined || end === undefined ? null : crossing(from, to, start, end);
			if (hit !== null) {
				onSegment.push({
					position: [
						from[0] + hit.sketchOffset * (to[0] - from[0]),
						from[1] + hit.sketchOffset * (to[1] - from[1]),
					],
					sketchEdge,
					sketchOffset: hit.sketchOffset,
					pathEdge,
					pathOffset: hit.pathOffset,
				});
			}
		}
		// One sketch segment can cross several path edges, and the order they were
		// found in is the ring's order rather than the pointer's.
		onSegment.sort((first, second) => first.sketchOffset - second.sketchOffset);
		found.push(...onSegment);
	}
	return found.filter(
		(at, index) => index === 0 || !samePlanarPosition(at.position, found[index - 1]?.position),
	);
}

/**
 * `path` with the stretch between the sketch's first and last crossing replaced
 * by the sketch, or the reason there is no such stretch.
 *
 * Crossings in between are ignored, which is what makes one rule cover a sketch
 * that wanders back over the boundary on its way across.
 */
export function reshapePath({
	path,
	sketch,
	closed,
}: {
	readonly path: PlanarPath;
	readonly sketch: PlanarPath;
	readonly closed: boolean;
}): ReshapeOutcome {
	const crossings = sketchCrossings(path, sketch, closed);
	const first = crossings[0];
	const last = crossings.at(-1);
	if (first === undefined || last === undefined || crossings.length < 2) {
		return { kind: 'refused', refusal: 'tooFewCrossings' };
	}
	const replacement = sketchBetween(sketch, first, last);
	return {
		kind: 'reshaped',
		path: closed
			? reshapedRing(path, first, last, replacement)
			: reshapedLine(path, first, last, replacement),
	};
}

/**
 * The stretch of `sketch` running from `first` to `last`, the tails outside the
 * path dropped.
 *
 * The crossing positions are the ends, so the replacement meets the path exactly
 * where the sketch did rather than at whichever vertex happened to be nearest.
 */
function sketchBetween(
	sketch: PlanarPath,
	first: SketchCrossing,
	last: SketchCrossing,
): PlanarPath {
	return withoutRepeats([
		first.position,
		...sketch.slice(first.sketchEdge + 1, last.sketchEdge + 1),
		last.position,
	]);
}

/**
 * The ring `replacement` leaves, which is one of the two the crossings allow.
 *
 * Two crossings cut a ring into two arcs, and replacing either one with the
 * sketch closes a ring. The larger of the two wins, so a sketch bulging outside
 * gives the shape plus the bulge and a sketch dipping inside gives the shape
 * less the dip, with no mode for the user to pick and no reading of which side
 * the sketch ran. What that gives up is a sketch meant to cut away more than
 * half of a piece, which is Split's gesture rather than this one.
 */
function reshapedRing(
	path: PlanarPath,
	first: SketchCrossing,
	last: SketchCrossing,
	replacement: PlanarPath,
): PlanarPath {
	const inner = replacement.slice(1, -1);
	const keepingBackward = closedRing([...replacement, ...arcVertices(path, last, first)]);
	const keepingForward = closedRing([
		first.position,
		...arcVertices(path, first, last),
		last.position,
		...[...inner].reverse(),
	]);
	return Math.abs(ringArea(keepingBackward)) >= Math.abs(ringArea(keepingForward))
		? keepingBackward
		: keepingForward;
}

/**
 * The line `replacement` leaves: everything before the earlier crossing, the
 * sketch, then everything after the later one.
 *
 * A line has one answer rather than a ring's two, and the only question is which
 * way round the sketch runs. It is turned to follow the line rather than the
 * pointer, so sketching right to left over a line drawn left to right gives the
 * same result as sketching it the other way.
 */
function reshapedLine(
	path: PlanarPath,
	first: SketchCrossing,
	last: SketchCrossing,
	replacement: PlanarPath,
): PlanarPath {
	const forwards = alongPath(first) <= alongPath(last);
	const start = forwards ? first : last;
	const end = forwards ? last : first;
	return withoutRepeats([
		...path.slice(0, start.pathEdge + 1),
		...(forwards ? replacement : [...replacement].reverse()),
		...path.slice(end.pathEdge + 1),
	]);
}

/** How far along a line a crossing sits, as one number to compare. */
function alongPath(at: SketchCrossing): number {
	return at.pathEdge + at.pathOffset;
}

/**
 * The vertices of `path` strictly between two crossings, walking forward.
 *
 * Forward is the direction the ring is stored in, so both arcs come back wound
 * the way the ring was drawn and a reshape never flips it.
 */
function arcVertices(
	path: PlanarPath,
	from: SketchCrossing,
	to: SketchCrossing,
): readonly PlanarPosition[] {
	const count = arcLength(from, to, path.length);
	const walked: PlanarPosition[] = [];
	for (let step = 1; step <= count; step += 1) {
		const position = path[(from.pathEdge + step) % path.length];
		if (position !== undefined) {
			walked.push(position);
		}
	}
	return walked;
}

/**
 * How many vertices the forward arc from `from` to `to` passes.
 *
 * Two crossings on one edge are the case worth naming: forward from the earlier
 * to the later passes nothing at all, and forward from the later to the earlier
 * goes the whole way round.
 */
function arcLength(from: SketchCrossing, to: SketchCrossing, vertices: number): number {
	if (from.pathEdge === to.pathEdge) {
		return from.pathOffset <= to.pathOffset ? 0 : vertices;
	}
	return (to.pathEdge - from.pathEdge + vertices) % vertices;
}

/**
 * Where two segments meet, as how far along each of them it is, or null when
 * they do not meet at one position.
 *
 * A zero cross product is two segments running parallel, collinear ones
 * included. Collinear overlap has no single position to report and is not a
 * crossing anybody sketched.
 */
function crossing(
	from: PlanarPosition,
	to: PlanarPosition,
	start: PlanarPosition,
	end: PlanarPosition,
): { readonly sketchOffset: number; readonly pathOffset: number } | null {
	const sketchX = to[0] - from[0];
	const sketchY = to[1] - from[1];
	const pathX = end[0] - start[0];
	const pathY = end[1] - start[1];
	const denominator = sketchX * pathY - sketchY * pathX;
	if (denominator === 0) {
		return null;
	}
	const offsetX = start[0] - from[0];
	const offsetY = start[1] - from[1];
	const sketchOffset = (offsetX * pathY - offsetY * pathX) / denominator;
	const pathOffset = (offsetX * sketchY - offsetY * sketchX) / denominator;
	const within = (value: number) => value >= 0 && value <= 1;
	return within(sketchOffset) && within(pathOffset) ? { sketchOffset, pathOffset } : null;
}

/** Twice the signed area a ring encloses, which is all a comparison needs. */
function ringArea(ring: PlanarPath): number {
	let total = 0;
	for (let index = 0; index < ring.length; index += 1) {
		const at = ring[index];
		const next = ring[(index + 1) % ring.length];
		if (at !== undefined && next !== undefined) {
			total += at[0] * next[1] - next[0] * at[1];
		}
	}
	return total;
}

/** A ring with no repeats, the closing one included, the way a draft holds it. */
function closedRing(ring: PlanarPath): PlanarPath {
	const trimmed = withoutRepeats(ring);
	const first = trimmed[0];
	const last = trimmed.at(-1);
	return trimmed.length > 1 &&
		first !== undefined &&
		last !== undefined &&
		samePlanarPosition(first, last)
		? trimmed.slice(0, -1)
		: trimmed;
}

/**
 * `positions` with each repeat of the position before it dropped.
 *
 * A crossing that lands exactly on a vertex would otherwise put that vertex in
 * twice, once as the crossing and once as itself, which is a zero-length edge in
 * the shape the user gets back.
 */
function withoutRepeats(positions: PlanarPath): PlanarPath {
	const kept: PlanarPosition[] = [];
	for (const position of positions) {
		if (!samePlanarPosition(kept.at(-1), position)) {
			kept.push(position);
		}
	}
	return kept;
}

/** Whether two positions are the same one, to within a rounding step. */
function samePlanarPosition(
	first: PlanarPosition | undefined,
	second: PlanarPosition | undefined,
): boolean {
	if (first === undefined || second === undefined) {
		return false;
	}
	return Math.abs(first[0] - second[0]) < EPSILON && Math.abs(first[1] - second[1]) < EPSILON;
}
