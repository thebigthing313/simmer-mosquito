/**
 * Sketching a line across a ring or a line: what the stretch between the
 * sketch's first and last crossing is replaced by, and where the sketch cuts the
 * shape in two.
 *
 * Hand-written and dependency-free, which is the whole reason it is here rather
 * than in the draw control: `packages/mapping` takes no geometry library, and
 * ADR 0018's children share one segment-intersection routine rather than each
 * carrying a copy. {@link reshapePath} and {@link splitRings} read the same
 * {@link sketchCrossings}.
 *
 * Planar, on raw degrees. Two segments a few hundred metres apart cross at the
 * same position whether the arithmetic is planar or spherical, and the draw
 * control already picks its nearest edge the same way. Nothing here reports a
 * distance, so metres are not the unit of any answer it gives.
 */

import { geometryContainsLngLat } from './geometry.js';

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

// --- splitting ---------------------------------------------------------------

/** Why a sketch cannot cut the part it was drawn across into two. */
export type SplitRefusal = 'doesNotDivide';

/** One part of a split: ring 0 is its outline, and the rest are its holes. */
export type SplitPart = readonly PlanarPath[];

/** The two parts a sketch leaves, or the reason there are not two of them. */
export type SplitOutcome =
	| { readonly kind: 'split'; readonly parts: readonly [SplitPart, SplitPart] }
	| { readonly kind: 'refused'; readonly refusal: SplitRefusal };

const NOT_DIVIDED = { kind: 'refused', refusal: 'doesNotDivide' } as const;

/**
 * The two parts `sketch` cuts `rings` into, or the reason it cuts none.
 *
 * `closed` says whether ring 0 is an outline or a line, the way
 * {@link reshapePath} reads it. A line has no holes and divides at its one
 * crossing; an outline divides where the sketch runs from one side of it to the
 * other.
 *
 * Exactly two parts or nothing. A sketch that enters and leaves twice would
 * leave three, which is a gesture nobody asked for and a result the part list
 * has no way to explain, so it refuses instead. The order of the two is the
 * order the boundary walk found them in and means nothing.
 */
export function splitRings({
	rings,
	sketch,
	closed,
}: {
	readonly rings: readonly PlanarPath[];
	readonly sketch: PlanarPath;
	readonly closed: boolean;
}): SplitOutcome {
	const shell = rings[0];
	if (shell === undefined || sketch.length < 2) {
		return NOT_DIVIDED;
	}
	return closed ? splitArea(shell, rings.slice(1), sketch) : splitLine(shell, sketch);
}

/**
 * A line cut at the one place the sketch crosses it.
 *
 * One crossing rather than two, which is the whole difference from a ring: a
 * line has two ends already, so the sketch only has to meet it once. Two
 * crossings would leave three lines.
 */
function splitLine(line: PlanarPath, sketch: PlanarPath): SplitOutcome {
	const crossings = sketchCrossings(line, sketch, false);
	const at = crossings[0];
	if (at === undefined || crossings.length !== 1) {
		return NOT_DIVIDED;
	}
	const before = withoutRepeats([...line.slice(0, at.pathEdge + 1), at.position]);
	const after = withoutRepeats([at.position, ...line.slice(at.pathEdge + 1)]);
	if (before.length < 2 || after.length < 2) {
		return NOT_DIVIDED;
	}
	return { kind: 'split', parts: [[before], [after]] };
}

/**
 * An outline and its holes cut in two, by walking the boundary the sketch
 * leaves behind.
 *
 * The walk is what makes holes work without a clipping library. Every crossing
 * becomes a node; the rings and the stretches of sketch that run inside the area
 * become the edges between them; and tracing each face by always taking the
 * first turn clockwise from the way it came in gives the pieces, hole arcs and
 * all. A hole the sketch crosses has each of its two arcs picked up by one of
 * the pieces, which is how it stops being a hole and becomes their boundary. A
 * hole it misses has no node and no edge, so it is placed afterwards, in the
 * piece that contains it.
 *
 * Rings go in wound the way the walk needs them, outline counter-clockwise and
 * holes clockwise, so every ring edge has the inside of the area on its left.
 * The pieces are wound back the way the outline arrived, so splitting never
 * flips a shape the user drew.
 */
function splitArea(
	shell: PlanarPath,
	holes: readonly PlanarPath[],
	sketch: PlanarPath,
): SplitOutcome {
	const walked = [wound(shell, true), ...holes.map((hole) => wound(hole, false))];
	const nodes = splitNodes(walked, sketch);
	if (!dividesEvenly(walked, nodes)) {
		return NOT_DIVIDED;
	}
	const faces = walkFaces([...ringEdges(walked, nodes), ...cutEdges(walked, sketch, nodes)]);
	const [first, second] = faces;
	if (faces.length !== 2 || first === undefined || second === undefined) {
		return NOT_DIVIDED;
	}
	const clockwise = ringArea(shell) < 0;
	const outlines: readonly [PlanarPath, PlanarPath] = [
		clockwise ? [...first].reverse() : first,
		clockwise ? [...second].reverse() : second,
	];
	return placeHoles(outlines, holes, nodes);
}

/** `ring` wound counter-clockwise, or clockwise when `counterClockwise` is false. */
function wound(ring: PlanarPath, counterClockwise: boolean): PlanarPath {
	return ringArea(ring) >= 0 === counterClockwise ? ring : [...ring].reverse();
}

/** Where the sketch meets one of the rings, and which ring that was. */
interface SplitNode extends SketchCrossing {
	readonly ring: number;
}

/** Every crossing of `sketch` over every ring, tagged with the ring it is on. */
function splitNodes(rings: readonly PlanarPath[], sketch: PlanarPath): readonly SplitNode[] {
	return rings.flatMap((ring, index) =>
		sketchCrossings(ring, sketch, true).map((crossing) => ({ ...crossing, ring: index })),
	);
}

/**
 * Whether the crossings are the shape a two-way cut has: the outline met at
 * least twice, and every ring met an even number of times.
 *
 * An odd count is a sketch that stopped inside the ring it was crossing, which
 * leaves a slit rather than a cut and would walk one face back out along its own
 * edge. Refusing here keeps that out of the walk rather than leaving the face
 * count to notice afterwards.
 */
function dividesEvenly(rings: readonly PlanarPath[], nodes: readonly SplitNode[]): boolean {
	const counts = rings.map((_, index) => nodes.filter((node) => node.ring === index).length);
	return (counts[0] ?? 0) >= 2 && counts.every((count) => count % 2 === 0);
}

/** One stretch of boundary between two crossings, walked in one direction. */
interface SplitEdge {
	/** The node it leaves, and the node it arrives at. */
	readonly from: number;
	readonly to: number;
	/** Both crossing positions, and every vertex between them. */
	readonly positions: PlanarPath;
}

/** One crossing and the id the edges name it by. */
interface NumberedNode {
	readonly node: SplitNode;
	readonly id: number;
}

/**
 * The arcs the crossings cut each ring into, in the ring's own direction.
 *
 * One arc per crossing, running to the next one round the ring, so a ring with
 * no crossing contributes nothing and drops out of the walk entirely.
 */
function ringEdges(
	rings: readonly PlanarPath[],
	nodes: readonly SplitNode[],
): readonly SplitEdge[] {
	const numbered = nodes.map((node, id) => ({ node, id }));
	return rings.flatMap((ring, index) => {
		const onRing = numbered
			.filter((entry) => entry.node.ring === index)
			.sort((first, second) => alongRing(first.node) - alongRing(second.node));
		return onRing.flatMap((entry, at) => {
			const next = onRing[(at + 1) % onRing.length];
			return next === undefined ? [] : [ringArc(ring, entry, next)];
		});
	});
}

/** The arc of `ring` running forward from one crossing to the next. */
function ringArc(ring: PlanarPath, from: NumberedNode, to: NumberedNode): SplitEdge {
	return {
		from: from.id,
		to: to.id,
		positions: withoutRepeats([
			from.node.position,
			...arcVertices(ring, from.node, to.node),
			to.node.position,
		]),
	};
}

/** How far round a ring a crossing sits, as one number to compare. */
function alongRing(at: SketchCrossing): number {
	return at.pathEdge + at.pathOffset;
}

/**
 * The stretches of sketch between consecutive crossings that run inside the
 * area, each usable in both directions.
 *
 * A stretch running outside the outline, or through a hole, is not a cut and is
 * left out, so the walk never turns onto sketch that is not boundary. Both
 * directions because each stretch ends up on the boundary of both pieces, once
 * each way round.
 */
function cutEdges(
	rings: readonly PlanarPath[],
	sketch: PlanarPath,
	nodes: readonly SplitNode[],
): readonly SplitEdge[] {
	const ordered = nodes
		.map((node, id) => ({ node, id }))
		.sort((first, second) => alongSketch(first.node) - alongSketch(second.node));
	const edges: SplitEdge[] = [];
	for (let at = 0; at + 1 < ordered.length; at += 1) {
		const from = ordered[at];
		const to = ordered[at + 1];
		if (from === undefined || to === undefined) {
			continue;
		}
		const positions = sketchBetween(sketch, from.node, to.node);
		if (positions.length < 2 || !insideArea(rings, positions)) {
			continue;
		}
		edges.push({ from: from.id, to: to.id, positions });
		edges.push({ from: to.id, to: from.id, positions: [...positions].reverse() });
	}
	return edges;
}

/** How far along the sketch a crossing sits, as one number to compare. */
function alongSketch(at: SketchCrossing): number {
	return at.sketchEdge + at.sketchOffset;
}

/**
 * Whether a stretch of sketch runs through the area rather than outside it or
 * through a hole.
 *
 * Read at the middle of its first segment. The stretch crosses no ring between
 * its ends, so every point strictly inside it answers the same, while both ends
 * sit on a ring and would answer that they are on the boundary.
 */
function insideArea(rings: readonly PlanarPath[], stretch: PlanarPath): boolean {
	const from = stretch[0];
	const to = stretch[1];
	if (from === undefined || to === undefined) {
		return false;
	}
	return containsPosition(rings, [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2]);
}

/** Whether `position` is inside `rings`, outline first and holes after it. */
function containsPosition(rings: readonly PlanarPath[], position: PlanarPosition): boolean {
	return geometryContainsLngLat(
		{ type: 'Polygon', coordinates: rings.map((ring) => [...ring, ...ring.slice(0, 1)]) },
		{ lng: position[0], lat: position[1] },
	);
}

/**
 * Every face the edges bound, each as a ring with no repeated closing position.
 *
 * At each node the walk takes the first edge clockwise from the way it came in,
 * which traces faces with their inside on the left, so each comes back
 * counter-clockwise. Every directed edge belongs to exactly one face, so marking
 * them used is both what ends a face and what stops the next one repeating it.
 */
function walkFaces(edges: readonly SplitEdge[]): readonly PlanarPath[] {
	const outgoing = new Map<number, number[]>();
	edges.forEach((edge, index) => {
		outgoing.set(edge.from, [...(outgoing.get(edge.from) ?? []), index]);
	});
	const used = new Set<number>();
	const faces: PlanarPath[] = [];
	for (let start = 0; start < edges.length; start += 1) {
		const positions: PlanarPosition[] = [];
		let at = start;
		while (at !== -1 && !used.has(at)) {
			used.add(at);
			positions.push(...(edges[at]?.positions ?? []));
			at = nextEdge(edges, outgoing, at);
		}
		const face = closedRing(positions);
		if (face.length >= 3 && ringArea(face) > 0) {
			faces.push(face);
		}
	}
	return faces;
}

/**
 * The edge the walk takes out of the node it just arrived at, or -1 where there
 * is none.
 *
 * The reference is the direction back the way it came, and the first turn
 * clockwise from that is the next edge. Turning back down the edge it arrived on
 * counts as a full circle rather than as no turn at all, so it is the last
 * resort and a dead end is walked back out of rather than sat on.
 */
function nextEdge(
	edges: readonly SplitEdge[],
	outgoing: ReadonlyMap<number, readonly number[]>,
	at: number,
): number {
	const arriving = edges[at];
	if (arriving === undefined) {
		return -1;
	}
	const back = heading(arriving.positions.at(-1), arriving.positions.at(-2));
	let chosen = -1;
	let shortest = Number.POSITIVE_INFINITY;
	for (const candidate of outgoing.get(arriving.to) ?? []) {
		const leaving = edges[candidate];
		const turn = clockwiseTurn(back, heading(leaving?.positions[0], leaving?.positions[1]));
		if (turn < shortest) {
			shortest = turn;
			chosen = candidate;
		}
	}
	return chosen;
}

/** The direction from one position to another, in radians. */
function heading(from: PlanarPosition | undefined, to: PlanarPosition | undefined): number {
	if (from === undefined || to === undefined) {
		return 0;
	}
	return Math.atan2(to[1] - from[1], to[0] - from[0]);
}

/** How far clockwise `to` is from `from`, in radians, a full turn for no turn. */
function clockwiseTurn(from: number, to: number): number {
	const full = 2 * Math.PI;
	const turn = from - to;
	const wrapped = turn - Math.floor(turn / full) * full;
	return wrapped <= EPSILON ? full : wrapped;
}

/**
 * The two outlines with the holes the sketch missed put back in the piece each
 * one falls in.
 *
 * A hole the sketch crossed is already boundary on both pieces and is not one of
 * these. A hole that lands in neither piece is a shape the walk did not
 * understand, and a polygon with a stray ring is one PostGIS refuses at write,
 * so it refuses here instead.
 */
function placeHoles(
	outlines: readonly [PlanarPath, PlanarPath],
	holes: readonly PlanarPath[],
	nodes: readonly SplitNode[],
): SplitOutcome {
	const placed: readonly [PlanarPath[], PlanarPath[]] = [[], []];
	for (const [index, hole] of holes.entries()) {
		if (nodes.some((node) => node.ring === index + 1)) {
			continue;
		}
		const side = outlines.findIndex((outline) => holeSits(outline, hole));
		const target = placed[side];
		if (target === undefined) {
			return NOT_DIVIDED;
		}
		target.push(hole);
	}
	return {
		kind: 'split',
		parts: [
			[outlines[0], ...placed[0]],
			[outlines[1], ...placed[1]],
		],
	};
}

/** Whether every corner of `hole` falls inside `outline`. */
function holeSits(outline: PlanarPath, hole: PlanarPath): boolean {
	return hole.length > 0 && hole.every((position) => containsPosition([outline], position));
}
