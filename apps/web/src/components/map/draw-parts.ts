/**
 * The part algebra and the refusal rules behind the draw control: what a shape's
 * pieces are, what a gesture would leave, and why the control would not take it.
 *
 * Nothing here touches Mapbox or React. Every function takes geometry and a mode
 * and answers with geometry or a refusal code, so a question about coordinates
 * is asked by calling one rather than by simulating clicks against a fake map
 * (#630). `use-map-draw.ts` is the gesture machine over the top: it reads pointer
 * events, tracks the mode, paints the sources and layers, and calls in here for
 * every answer about shape.
 *
 * It sits beside its caller rather than in `packages/mapping`, where the planar
 * path family went in #640. That package is dependency-free and deliberately
 * does not depend on `@simmer-mosquito/domain`, which `geometry-import.ts` says
 * in as many words. This algebra is domain-bound the whole way down: it reads
 * the base shapes off the register, promotes and demotes through
 * `getMultipartGeometryType`, and refuses a piece with `geometryCoversGround`.
 * Moving it there would either give that package the dependency it exists
 * without, or write the six shape names out a second time, which
 * `check:geometry-policies` refuses at zero. The ring arithmetic underneath is
 * already in `packages/mapping` and is what `apps/mobile` would share.
 *
 * The mode types are here too, not because a mode is geometry, but because every
 * refusal rule reads one: `editProblem` takes an `EditMode` and
 * `continuationProblem` a `DrawMode`. Splitting them off would leave the two
 * halves importing each other.
 */

import {
	type BaseGeometryType,
	geometryCoversGround,
	getMultipartGeometryType,
	isBaseGeometryType,
	isSupportedGeometryType,
	type OwnedGeometryKind,
	type OwnedGeometryTypeFor,
} from '@simmer-mosquito/domain';
import {
	closeRing,
	type DrawVertexRef,
	geometryContainsLngLat,
	hasDistinctPositions,
	type PlanarPath,
	type PlanarPosition,
	reshapePath,
	samePlanarPosition,
	splitRings,
	unclosedRing,
} from '@simmer-mosquito/mapping';

type PolygonRings = readonly PlanarPath[];

/**
 * The shape the type toggle offers, which is the domain's base shapes.
 *
 * Deliberately not `DrawGeometry['type']`. A record promotes to its multi shape
 * on gaining a second part and demotes on losing one, so a multi shape is
 * something the control arrives at and never something the user picks.
 */
export type DrawGeometryType = BaseGeometryType;

/**
 * A geometry a record form can produce. Mirrors the GeoJSON shape a command's
 * `locationSource.geometry` expects, so a finished draft can be handed straight
 * to the optimistic mutation without translation.
 *
 * All six shapes, because the control draws in parts. Positions are
 * `PlanarPosition` rather than the domain's optional triple, for the reason that
 * type carries: nothing here places an altitude, and the point paths read
 * `coordinates[0]` and `[1]` directly.
 */
export type DrawGeometry =
	| { readonly type: 'Point'; readonly coordinates: PlanarPosition }
	| { readonly type: 'LineString'; readonly coordinates: PlanarPath }
	| { readonly type: 'Polygon'; readonly coordinates: PolygonRings }
	| { readonly type: 'MultiPoint'; readonly coordinates: PlanarPath }
	| { readonly type: 'MultiLineString'; readonly coordinates: PolygonRings }
	| { readonly type: 'MultiPolygon'; readonly coordinates: readonly PolygonRings[] };

/**
 * One part of a drawn shape, carried as the single-part geometry it would be on
 * its own.
 *
 * A part is a geometry rather than a bare coordinate list so that everything
 * already written against a geometry works on one: the map renders it, the
 * bounds reader frames it, and the part row labels it.
 */
export type DrawPartGeometry = Extract<DrawGeometry, { readonly type: DrawGeometryType }>;

/**
 * The drawn shapes a record of `Kind` stores.
 *
 * What the five form predicates assert, so that none of them names a shape. Each
 * checks `getOwnedGeometryPolicy(kind).allowedTypes` at run time and used to
 * hand-write `GeoJsonPoint` beside it; the pair agreed by coincidence, and
 * widening a policy would have moved the check without moving the type. This
 * reads the same register the check does, so the two move together and the
 * routes downstream stop compiling when a policy grows a shape they cannot
 * handle.
 */
export type DrawGeometryFor<Kind extends OwnedGeometryKind> = Extract<
	DrawGeometry,
	{ readonly type: OwnedGeometryTypeFor<Kind> }
>;

/**
 * Whether `value` names a shape the type toggle offers.
 *
 * The domain's register is what says which shapes exist; three files used to
 * spell the same three names out by hand instead.
 */
export function isDrawGeometryType(value: unknown): value is DrawGeometryType {
	return isBaseGeometryType(value);
}

/**
 * Read a stored geometry back into something the draw flow can edit.
 *
 * All six shapes now, because the part list is the affordance whose absence used
 * to justify reading a multi shape as "no geometry" and quietly leaving the
 * record whatever it held. A `GeometryCollection` still reads as none: it has no
 * `coordinates`, and the parts of one are not parts of a single shape.
 */
export function toDrawGeometry(geojson: unknown): DrawGeometry | null {
	if (geojson === null || typeof geojson !== 'object') {
		return null;
	}
	const candidate = geojson as { readonly type?: unknown; readonly coordinates?: unknown };
	// A type-only geometry would crash the summary and the preview, so require
	// coordinates to be present and non-empty.
	if (!Array.isArray(candidate.coordinates) || candidate.coordinates.length === 0) {
		return null;
	}
	return isSupportedGeometryType(candidate.type) ? (candidate as DrawGeometry) : null;
}

/**
 * The parts of `geometry`, in stored order, one entry for a single-part shape.
 *
 * The one place a multi shape is taken apart. The part list, the map draft and
 * Remove all read it, so "how many pieces is this" has a single answer.
 */
export function drawParts(geometry: DrawGeometry | null): readonly DrawPartGeometry[] {
	if (geometry === null) {
		return [];
	}
	switch (geometry.type) {
		case 'MultiPoint':
			return geometry.coordinates.map((coordinates) => ({ type: 'Point', coordinates }));
		case 'MultiLineString':
			return geometry.coordinates.map((coordinates) => ({ type: 'LineString', coordinates }));
		case 'MultiPolygon':
			return geometry.coordinates.map((coordinates) => ({ type: 'Polygon', coordinates }));
		default:
			return [geometry];
	}
}

/**
 * The shape `parts` make: the part itself at one, the multi shape at two or more,
 * nothing at zero.
 *
 * Promote and demote in place, so a one-part multi shape never leaves here. The
 * domain demotes one on the way in as well, and the two agreeing is what lets a
 * removed part put the record back on its base shape without a second write.
 */
export function geometryFromParts(parts: readonly DrawPartGeometry[]): DrawGeometry | null {
	const first = parts[0];
	if (first === undefined) {
		return null;
	}
	if (parts.length === 1) {
		return first;
	}
	switch (first.type) {
		case 'Point':
			return {
				type: getMultipartGeometryType('Point'),
				coordinates: parts.flatMap((part) => (part.type === 'Point' ? [part.coordinates] : [])),
			};
		case 'LineString':
			return {
				type: getMultipartGeometryType('LineString'),
				coordinates: parts.flatMap((part) =>
					part.type === 'LineString' ? [part.coordinates] : [],
				),
			};
		default:
			return {
				type: getMultipartGeometryType('Polygon'),
				coordinates: parts.flatMap((part) => (part.type === 'Polygon' ? [part.coordinates] : [])),
			};
	}
}

/**
 * The holes cut out of `part`, in stored order, empty for a part that has none.
 *
 * A polygon's first ring is its outline and every ring after it is a hole, so
 * the hole rows and Remove both read this rather than slicing rings by hand.
 */
export function drawHoles(part: DrawPartGeometry): readonly PlanarPath[] {
	return part.type === 'Polygon' ? part.coordinates.slice(1) : [];
}

/**
 * What a finished draw does with the parts already committed. `replace` takes
 * every one of them, which is what "Redraw geometry" means at any part count;
 * `part` appends; `hole` cuts a ring out of the one part it names; `continue`
 * puts back the one part it names, redrawn from the vertices it already had;
 * `edit` puts back the one part it names, rings and all, as the edit left it.
 */
export type DrawTarget =
	| { readonly kind: 'replace' }
	| { readonly kind: 'part' }
	| { readonly kind: 'hole'; readonly partIndex: number }
	| {
			readonly kind: 'continue';
			readonly partIndex: number;
			/** How many vertices the part arrived with, which is where Undo stops. */
			readonly seeded: number;
	  }
	| { readonly kind: 'edit'; readonly partIndex: number };

export type DrawMode = {
	readonly kind: 'draw';
	readonly type: DrawGeometryType;
	readonly target: DrawTarget;
};

/**
 * A committed part open for editing.
 *
 * Its own mode rather than another {@link DrawTarget}, because a draw collects
 * one flat list of vertices and an edit holds every ring of the part at once.
 * Opening it, painting it and committing it are separate from the gestures that
 * change it, which is what lets reshape and split preview into the same draft
 * the three vertex gestures write to.
 */
export type EditMode = {
	readonly kind: 'edit';
	readonly type: DrawGeometryType;
	readonly partIndex: number;
	/** Ring 0 is the outline; the rest are holes. Closing positions are dropped. */
	readonly rings: readonly PlanarPath[];
	/**
	 * The rings before each gesture, oldest first.
	 *
	 * Undo's floor is the part as it was opened, the way a continuation's floor is
	 * the vertices it opened with: an edit must not eat into the piece the user
	 * asked to edit.
	 */
	readonly history: readonly (readonly PlanarPath[])[];
	readonly selected: DrawVertexRef | null;
	/**
	 * The line being sketched, or null while the edit is not sketching one.
	 *
	 * Its own list rather than another ring, because it is not part of the shape:
	 * it previews into the rings and is gone the moment it lands. Empty is a
	 * sketch that has been started and has no vertices yet, which is not the same
	 * as no sketch at all.
	 */
	readonly sketch: DrawSketch | null;
	/**
	 * Whether the record kind can store the second piece a split leaves, read off
	 * `OWNED_GEOMETRY_POLICIES` when the part was opened.
	 *
	 * Carried on the mode rather than looked up where it is needed, so the paint,
	 * the problem and Finish read one answer and none of them has to be handed the
	 * record kind.
	 */
	readonly allowsParts: boolean;
};

/** The line one of the two sketch tools is tracing, and which tool that is. */
export type DrawSketch = {
	readonly tool: DrawSketchTool;
	readonly positions: readonly PlanarPosition[];
};

export type Mode =
	| { readonly kind: 'idle' }
	| DrawMode
	| EditMode
	| {
			readonly kind: 'point';
			readonly resolve: (point: DrawGeometry & { readonly type: 'Point' }) => void;
			readonly reject: (error: Error) => void;
	  };

/** A vertex the pointer has hold of, drawn where the cursor is until it lands. */
export interface DrawDrag {
	readonly vertex: DrawVertexRef;
	readonly position: PlanarPosition;
}

/**
 * Why a hole as drawn cannot be cut out of the piece it was aimed at.
 *
 * `escapes` is a vertex outside the piece, or inside a hole the piece already
 * has. `swallows` is a hole that takes the whole piece, which leaves a polygon
 * covering no ground and a write the server answers 400.
 */
export type DrawHoleProblem = 'escapes' | 'swallows';

/**
 * Which piece a draw is aimed at, and how many pieces there are to tell it from.
 *
 * The toolbar names the piece only once there are several: at one piece there is
 * no row list the user could have read a number off, so the number is a term
 * they have not seen.
 */
export interface DrawPartTarget {
	/** The piece the draw is aimed at, numbered the way its row is. */
	readonly partNumber: number;
	readonly partCount: number;
}

/** The hole being drawn: the piece it belongs to, and what is wrong with it. */
export interface DrawHoleDraft extends DrawPartTarget {
	readonly problem: DrawHoleProblem | null;
}

/**
 * Why a part as continued cannot go back into the shape.
 *
 * `holesEscape` is a hole the part already had that the redrawn outline no
 * longer contains, which is a polygon PostGIS calls invalid.
 */
export type DrawContinueProblem = 'holesEscape';

/** The part being continued, and what is wrong with the outline as drawn. */
export interface DrawContinueDraft extends DrawPartTarget {
	readonly problem: DrawContinueProblem | null;
}

/**
 * Why a part as edited cannot go back into the shape.
 *
 * `holesEscape` is the continuation's, read from the other end: a hole the edit
 * has pushed outside the outline, or one that now takes the whole of it.
 * `tooFewVertices` is a ring left below the three distinct corners an area
 * needs, or a line below two, which Delete may do and Finish may not.
 * `tooFewCrossings` is a reshape sketch that never crosses the boundary twice,
 * so there is no stretch of it to replace. `doesNotDivide` is the split's
 * equivalent: a sketch that leaves one piece, or three. `cannotHoldParts` is a
 * split on a record kind with nowhere to put the second piece, which
 * `OWNED_GEOMETRY_POLICIES` decides. `coversNoGround` is an outline with corners
 * enough and no area between them, which a reshape can leave and three clicks in
 * one spot can too.
 */
export type DrawEditProblem =
	| DrawContinueProblem
	| 'tooFewVertices'
	| 'tooFewCrossings'
	| 'doesNotDivide'
	| 'cannotHoldParts'
	| 'coversNoGround';

/**
 * Which tool the open sketch belongs to.
 *
 * Reshape replaces the stretch of boundary between the sketch's two crossings;
 * split cuts the piece in two along it. Both trace a line over the same edit
 * draft, so the tool is what says which of the two the line means.
 */
export type DrawSketchTool = 'reshape' | 'split';

/** The line being sketched: which tool is drawing it, and how far along it is. */
export interface DrawSketchDraft {
	readonly tool: DrawSketchTool;
	readonly vertices: number;
}

/** The part being edited, what is wrong with it, and which vertex is picked. */
export interface DrawEditDraft extends DrawPartTarget {
	readonly problem: DrawEditProblem | null;
	/** The vertex Delete would remove, or null while none is picked. */
	readonly selected: DrawVertexRef | null;
	/**
	 * The line being sketched, or null while there is no sketch.
	 *
	 * One field rather than a flag, a tool and a count, because a sketch that has
	 * been started and has no vertices yet is a real state and three fields would
	 * have to agree on it.
	 */
	readonly sketch: DrawSketchDraft | null;
}

/**
 * `parts` with a finished draw folded into them, which is the whole list for a
 * replace, one more entry for an add, and one entry swapped for a hole, a
 * continuation or an edit.
 *
 * `finished` is a list because a split hands back two, and both go in where the
 * one they replace was, so the pieces of a shape stay in the order they sit on
 * the map. Everything else hands back exactly one.
 */
export function withParts(
	parts: readonly DrawPartGeometry[],
	target: DrawTarget,
	finished: readonly DrawPartGeometry[],
): readonly DrawPartGeometry[] {
	if (target.kind === 'replace') {
		return finished;
	}
	if (target.kind === 'part') {
		return [...parts, ...finished];
	}
	return parts.flatMap((at, index) => (index === target.partIndex ? finished : [at]));
}

/**
 * Whether two drawn shapes are the same shape.
 *
 * The type, then the coordinates position by position, at whatever depth the
 * shape nests them: a Point holds one pair, a MultiPolygon holds four levels of
 * array above the same pairs. One recursion rather than a case per type, because
 * every shape a draw can hold is arrays of numbers under `coordinates`.
 *
 * Exact numbers, not a tolerance. Both sides come from the same stored ring
 * through the same helpers, so an untouched piece round-trips to the identical
 * values, and anything the user actually moved differs by a click's worth of
 * degrees rather than by rounding.
 */
export function sameDrawGeometry(first: DrawGeometry | null, second: DrawGeometry | null): boolean {
	if (first === null || second === null) {
		return first === second;
	}
	return first.type === second.type && sameCoordinates(first.coordinates, second.coordinates);
}

/** {@link sameDrawGeometry}'s recursion over one `coordinates` tree. */
function sameCoordinates(first: unknown, second: unknown): boolean {
	if (!Array.isArray(first) || !Array.isArray(second)) {
		return first === second;
	}
	return (
		first.length === second.length &&
		first.every((entry, index) => sameCoordinates(entry, second[index]))
	);
}

/**
 * Where a continuation picks up: the part's own vertices, in order, with a
 * ring's repeated closing position dropped so the next click appends to the last
 * corner the user actually placed. `closeRing` puts it back on Finish.
 *
 * The drop is conditional because `closeRing` is: a ring adopted from a file or
 * a region is only closed if whoever wrote it closed it, and slicing one that is
 * not would lose a real corner.
 *
 * Null for a point, which is one position with no end to carry on from.
 */
export function continuedVertices(part: DrawPartGeometry): readonly PlanarPosition[] | null {
	return part.type === 'Point' ? null : (ringsOfPart(part)[0] ?? []);
}

/**
 * The rings of `part`, closing positions dropped, which is what an edit draft
 * holds and where a continuation picks up.
 *
 * Ring 0 is the outline of an area, the whole of a line, or the single position
 * of a point. A line is left exactly as stored: it has no closing position, and
 * one whose ends happen to meet would lose a real corner to the drop.
 */
export function ringsOfPart(part: DrawPartGeometry): readonly PlanarPath[] {
	if (part.type === 'Point') {
		return [[part.coordinates]];
	}
	if (part.type === 'LineString') {
		return [part.coordinates];
	}
	return part.coordinates.map(unclosedRing);
}

/** How far Undo pops back, which is the vertices a continuation opened with. */
export function vertexFloor(mode: Mode): number {
	return mode.kind === 'draw' && mode.target.kind === 'continue' ? mode.target.seeded : 0;
}

/**
 * The holes already cut into the part a continuation is redrawing.
 *
 * A continuation redraws the outline and nothing else, so the rings the user cut
 * earlier are not theirs to lose by adding one vertex to it.
 */
export function continuedHoles(
	mode: DrawMode,
	committed: DrawGeometry | null,
): readonly PlanarPath[] {
	if (mode.target.kind !== 'continue') {
		return [];
	}
	const part = drawParts(committed)[mode.target.partIndex];
	return part === undefined ? [] : drawHoles(part);
}

/** `part` with `holes` put back into it, which only an area can hold. */
export function withHoles(part: DrawPartGeometry, holes: readonly PlanarPath[]): DrawPartGeometry {
	return part.type === 'Polygon' && holes.length > 0
		? { type: 'Polygon', coordinates: [...part.coordinates, ...holes] }
		: part;
}

/**
 * The part the drawn vertices make, or `null` while there is not one yet.
 *
 * `canFinish` reads this too, so the covers-ground rule runs here rather than
 * beside the button: Finish would otherwise promise a write the server answers
 * 400. Three clicks in one spot passed `vertices.length < 3` and finished a
 * zero-area Polygon.
 */
function partFromVertices(
	type: DrawGeometryType,
	vertices: readonly PlanarPosition[],
): DrawPartGeometry | null {
	const part = shapeFromVertices(type, vertices);
	return part !== null && geometryCoversGround(part) ? part : null;
}

/**
 * What a finished draw commits, which is a whole part for a replace or an add,
 * the part with one more ring in it for a hole, and the part redrawn with its
 * holes still in it for a continuation.
 *
 * `canFinish` and `finish` both read it, so the button and the commit cannot
 * disagree about whether the shape on screen is one the record can hold.
 */
export function draftPart(
	mode: DrawMode,
	committed: DrawGeometry | null,
	vertices: readonly PlanarPosition[],
): DrawPartGeometry | null {
	if (mode.target.kind === 'hole') {
		const part = drawParts(committed)[mode.target.partIndex];
		if (part === undefined || vertices.length < 3 || holeProblem(part, vertices) !== null) {
			return null;
		}
		return partWithHole(part, vertices);
	}
	const outline = partFromVertices(mode.type, vertices);
	if (outline === null || mode.target.kind !== 'continue') {
		return outline;
	}
	return continuationProblem(outline, mode, committed) === null
		? withHoles(outline, continuedHoles(mode, committed))
		: null;
}

/**
 * Why the outline a continuation has drawn cannot go back into the shape.
 *
 * An appended vertex can carve the outline inward, and a hole left outside it is
 * a polygon PostGIS calls invalid. The same {@link holeProblem} that refuses a
 * hole escaping while it is cut answers this, so the two refusals are one rule
 * read from either end.
 */
export function continuationProblem(
	outline: DrawPartGeometry,
	mode: DrawMode,
	committed: DrawGeometry | null,
): DrawContinueProblem | null {
	const escaped = continuedHoles(mode, committed).some(
		(hole) => holeProblem(outline, hole) !== null,
	);
	return escaped ? 'holesEscape' : null;
}

/**
 * `part` with `vertices` cut out of it as one more ring, or null for a part that
 * has no inside to cut.
 *
 * Winding order is left exactly as drawn. GeoJSON asks for none, PostGIS ignores
 * it, and Mapbox's tessellator reads every ring past the first as a hole however
 * it is wound, so reversing one here would be a rule invented in this file.
 */
function partWithHole(
	part: DrawPartGeometry,
	vertices: readonly PlanarPosition[],
): DrawPartGeometry | null {
	return part.type === 'Polygon'
		? { type: 'Polygon', coordinates: [...part.coordinates, closeRing(vertices)] }
		: null;
}

/**
 * The hole `mode` is drawing, or null while the draw is not one.
 *
 * The map reads it to paint a refused hole red and the toolbar reads it to name
 * the part, so a red draft and an enabled Finish cannot appear together.
 */
export function holeDraftOf(
	mode: Mode,
	committed: DrawGeometry | null,
	vertices: readonly PlanarPosition[],
): DrawHoleDraft | null {
	if (mode.kind !== 'draw' || mode.target.kind !== 'hole') {
		return null;
	}
	const part = drawParts(committed)[mode.target.partIndex];
	return {
		...partTargetOf(committed, mode.target.partIndex),
		problem: part === undefined ? null : holeProblem(part, dedupeTrailing(vertices)),
	};
}

/**
 * The part `mode` is continuing, or null while the draw is not one.
 *
 * The map reads it to paint a refused outline red and the toolbar reads it to
 * say what is wrong, so a red draft and an enabled Finish cannot appear
 * together.
 */
export function continuedPartOf(
	mode: Mode,
	committed: DrawGeometry | null,
	vertices: readonly PlanarPosition[],
): DrawContinueDraft | null {
	if (mode.kind !== 'draw' || mode.target.kind !== 'continue') {
		return null;
	}
	const outline = partFromVertices(mode.type, dedupeTrailing(vertices));
	return {
		...partTargetOf(committed, mode.target.partIndex),
		problem: outline === null ? null : continuationProblem(outline, mode, committed),
	};
}

function partTargetOf(committed: DrawGeometry | null, partIndex: number): DrawPartTarget {
	return { partNumber: partIndex + 1, partCount: drawParts(committed).length };
}

/**
 * What is wrong with a hole drawn into `part`, or null while nothing is.
 *
 * Containment is {@link geometryContainsLngLat}, which already reads a polygon's
 * holes as outside it, so "inside the outline and outside the other holes" is
 * one call rather than a second point-in-polygon written here. It reports from
 * the first stray vertex, before there are enough of them to close a ring, so
 * the draft turns red while the pointer is still moving.
 */
export function holeProblem(
	part: DrawPartGeometry,
	vertices: readonly PlanarPosition[],
): DrawHoleProblem | null {
	if (part.type !== 'Polygon') {
		return null;
	}
	const outside = vertices.some(([lng, lat]) => !geometryContainsLngLat(part, { lng, lat }));
	if (outside) {
		return 'escapes';
	}
	if (vertices.length < 3) {
		return null;
	}
	const cut = partWithHole(part, vertices);
	return cut !== null && geometryCoversGround(cut) ? null : 'swallows';
}

function shapeFromVertices(
	type: DrawGeometryType,
	vertices: readonly PlanarPosition[],
): DrawPartGeometry | null {
	if (type === 'Point') {
		const point = vertices[0];
		return point === undefined ? null : { type: 'Point', coordinates: point };
	}
	if (type === 'LineString') {
		return vertices.length < 2 ? null : { type: 'LineString', coordinates: vertices };
	}
	return vertices.length < 3 ? null : { type: 'Polygon', coordinates: [closeRing(vertices)] };
}

// A double-click to finish lands as two near-identical clicks; drop a trailing
// vertex that duplicates the one before it so the saved shape has no zero-length
// final segment.
export function dedupeTrailing(vertices: readonly PlanarPosition[]): readonly PlanarPosition[] {
	if (vertices.length < 2) {
		return vertices;
	}
	const last = vertices[vertices.length - 1];
	const previous = vertices[vertices.length - 2];
	if (last !== undefined && previous !== undefined && samePlanarPosition(last, previous)) {
		return vertices.slice(0, -1);
	}
	return vertices;
}

/**
 * What an edit commits: every piece it would leave, each ring closed, with the
 * same covers-ground rule a draw runs.
 *
 * `canFinish` reads it, so the button and the commit cannot disagree. One piece
 * for every path but a split, which leaves two. Holes are folded in one at a
 * time through {@link holeProblem}, which is the rule that refuses one while it
 * is being cut, so an edit that pushes a hole out of the outline is refused by
 * the same answer read from the other end.
 */
function editedPartsOf(mode: EditMode): readonly DrawPartGeometry[] | null {
	const edited = editedRings(mode);
	if (edited === null || (mode.sketch?.tool === 'split' && !mode.allowsParts)) {
		return null;
	}
	const built: DrawPartGeometry[] = [];
	for (const rings of edited) {
		const part = editedPartFrom(mode.type, rings);
		if (part === null) {
			return null;
		}
		built.push(part);
	}
	return built;
}

/** One piece of an edit: its outline, then each of its holes cut out in turn. */
function editedPartFrom(
	type: DrawGeometryType,
	rings: readonly PlanarPath[],
): DrawPartGeometry | null {
	const [shell = [], ...holes] = rings;
	if (type === 'Point') {
		const position = shell[0];
		return position === undefined ? null : { type: 'Point', coordinates: position };
	}
	let part = partFromVertices(type, shell);
	const minimum = ringMinimum(type);
	for (const hole of holes) {
		// The same minimum {@link editProblem} names, so Finish and the message
		// under it cannot disagree about which ring is too short.
		if (part === null || !hasDistinctPositions(hole, minimum) || holeProblem(part, hole) !== null) {
			return null;
		}
		part = partWithHole(part, hole);
	}
	return part;
}

/**
 * The part `mode` is editing, or null while the draw is not one.
 *
 * The toolbar reads it to say what is wrong and which vertex Delete would take,
 * so a refused draft and an enabled Finish cannot appear together.
 */
export function editDraftOf(mode: Mode, committed: DrawGeometry | null): DrawEditDraft | null {
	if (mode.kind !== 'edit') {
		return null;
	}
	return {
		...partTargetOf(committed, mode.partIndex),
		problem: editProblem(mode),
		selected: mode.selected,
		sketch:
			mode.sketch === null
				? null
				: { tool: mode.sketch.tool, vertices: mode.sketch.positions.length },
	};
}

/**
 * What is wrong with the rings as edited, or null while nothing is.
 *
 * Every refusal {@link editedPartsOf} makes has a name here, in the order the
 * rings are read: the record kind first, then a sketch that did not do its job,
 * then what is left of the pieces. This is what the map paints red, so the
 * message under the button and the colour on screen are one answer.
 */
export function editProblem(mode: EditMode): DrawEditProblem | null {
	if (mode.sketch?.tool === 'split' && !mode.allowsParts) {
		return 'cannotHoldParts';
	}
	const parts = editedRings(mode);
	return parts === null ? sketchProblem(mode.sketch) : piecesProblem(mode, parts);
}

/**
 * Why a sketch left no pieces at all, or null while it is too short to have
 * done anything yet.
 *
 * The one place this vocabulary says null where Finish is still unavailable. A
 * sketch of one vertex or none is a draw in progress, the way one vertex of a
 * polygon is, and calling it a refusal would paint the piece red the moment the
 * tool was pressed.
 */
export function sketchProblem(sketch: DrawSketch | null): DrawEditProblem | null {
	if (sketch !== null && sketch.positions.length < 2) {
		return null;
	}
	return sketch?.tool === 'split' ? 'doesNotDivide' : 'tooFewCrossings';
}

/**
 * What is wrong with the pieces the edit would leave, in the order the rings are
 * read: a ring with too few corners, then an outline enclosing nothing, then a
 * hole outside it.
 */
export function piecesProblem(
	mode: EditMode,
	parts: readonly (readonly PlanarPath[])[],
): DrawEditProblem | null {
	if (parts.flat().some((ring) => !hasDistinctPositions(ring, ringMinimum(mode.type)))) {
		return 'tooFewVertices';
	}
	if (parts.some(([shell = []]) => partFromVertices(mode.type, shell) === null)) {
		return 'coversNoGround';
	}
	return parts.some((rings) => rings.length > 1) && editedPartsOf(mode) === null
		? 'holesEscape'
		: null;
}

/**
 * The pieces the sketch would leave as rings, the rings themselves when there is
 * no sketch, or null when the sketch cannot do what its tool means.
 *
 * Rings and not geometries, which is the whole difference from
 * {@link editedPartsOf}: this is what the map previews and what
 * {@link piecesProblem} reads corner by corner, and that one turns the same
 * pieces into the shapes Finish would commit.
 *
 * A reshape leaves one piece and a split two, which is the whole difference
 * between the tools once the crossings are read. Reshape touches only the
 * outline, so the holes the part already had ride through untouched, and one the
 * new outline no longer contains is refused by the same `holesEscape` that
 * refuses a hole cut outside its piece. A split hands its own holes back,
 * because which piece each one belongs to is part of the cut.
 *
 * `trailing` is the cursor, so the result the map previews follows the pointer.
 * Everything that decides whether Finish may land reads the placed vertices
 * alone, which is how the draw path already separates the two.
 */
export function editedRings(
	mode: EditMode,
	trailing: PlanarPosition | null = null,
): readonly (readonly PlanarPath[])[] | null {
	if (mode.sketch === null) {
		return [mode.rings];
	}
	const [shell, ...holes] = mode.rings;
	if (shell === undefined) {
		return null;
	}
	const placed = mode.sketch.positions;
	const sketch = dedupeTrailing(trailing === null ? placed : [...placed, trailing]);
	const closed = mode.type === 'Polygon';
	if (mode.sketch.tool === 'split') {
		const cut = splitRings({ rings: mode.rings, sketch, closed });
		return cut.kind === 'split' ? cut.parts.map((part) => [...part]) : null;
	}
	const outcome = reshapePath({ path: shell, sketch, closed });
	return outcome.kind === 'reshaped' ? [[outcome.path, ...holes]] : null;
}

/** How many distinct positions one ring of `type` needs to be worth anything. */
function ringMinimum(type: DrawGeometryType): number {
	if (type === 'Point') {
		return 1;
	}
	return type === 'LineString' ? 2 : 3;
}

/** Every vertex an edit is holding, the holes' corners included. */
function countRingVertices(rings: readonly PlanarPath[]): number {
	return rings.reduce((total, ring) => total + ring.length, 0);
}

/**
 * `mode` with its last gesture taken back, stopping at the part as opened.
 *
 * An open sketch is unwound first, one vertex at a time, and an empty one is
 * what Undo closes. Without that last step a sketch nobody wanted could only be
 * left by abandoning the whole edit.
 */
export function undoneEdit(mode: Mode): Mode {
	if (mode.kind !== 'edit') {
		return mode;
	}
	if (mode.sketch !== null) {
		const placed = mode.sketch.positions;
		return placed.length === 0
			? { ...mode, sketch: null }
			: { ...mode, sketch: { ...mode.sketch, positions: placed.slice(0, -1) } };
	}
	const rings = mode.history.at(-1);
	return rings === undefined
		? mode
		: { ...mode, rings, history: mode.history.slice(0, -1), selected: null };
}

/**
 * `mode` with a reshape sketch folded into the rings, or unchanged when the
 * sketch cannot reshape them.
 *
 * One Undo step, the way a moved vertex is, and the sketch is gone: what it left
 * behind is an outline the other gestures work on. Only reshape lands this way.
 * A split leaves two pieces, which is the part list's answer rather than a draft
 * this mode could go on holding, so its Finish commits.
 */
export function landedSketch(mode: Mode): Mode {
	if (mode.kind !== 'edit' || mode.sketch === null) {
		return mode;
	}
	const rings = editedRings(mode)?.[0];
	return rings === undefined
		? mode
		: { ...mode, rings, history: [...mode.history, mode.rings], selected: null, sketch: null };
}

/**
 * What Finish commits and where it goes, or null while the draft is not one the
 * record can hold.
 *
 * A list rather than one part because a split leaves two, which go in at the
 * index the one they replace came from. Every other path leaves exactly one.
 *
 * A point draw is left out because it commits on its own first click, and there
 * is no Finish button under it to press.
 */
export function finishedParts(
	mode: Mode,
	committed: DrawGeometry | null,
	vertices: readonly PlanarPosition[],
): { readonly target: DrawTarget; readonly parts: readonly DrawPartGeometry[] } | null {
	if (mode.kind === 'edit') {
		const parts = editedPartsOf(mode);
		return parts === null ? null : { target: { kind: 'edit', partIndex: mode.partIndex }, parts };
	}
	if (mode.kind !== 'draw' || mode.type === 'Point') {
		return null;
	}
	const part = draftPart(mode, committed, dedupeTrailing(vertices));
	return part === null ? null : { target: mode.target, parts: [part] };
}

/**
 * How far along the draw in progress is: which tool it is on, how many vertices
 * it holds, and whether Finish and Undo have anything to do.
 *
 * `MapDrawController` extends this rather than restating the four members, so
 * the controller the toolbar reads and the answer {@link draftProgress} gives it
 * cannot drift apart.
 */
export interface DrawProgress {
	readonly drawType: DrawGeometryType | null;
	readonly vertexCount: number;
	readonly canFinish: boolean;
	/**
	 * Whether Undo has anything left to pop.
	 *
	 * Not `vertexCount > 0`: a continuation opens with the piece's own vertices
	 * already placed, and Undo stops there rather than eating into them.
	 */
	readonly canUndo: boolean;
}

/**
 * {@link DrawProgress} read off the mode, the committed shape and the vertices
 * placed so far.
 *
 * One place rather than four expressions beside the returned object, because a
 * draw and an edit answer each of them differently and the four had to agree on
 * which of the two they were reading.
 */
export function draftProgress(
	mode: Mode,
	committed: DrawGeometry | null,
	vertices: readonly PlanarPosition[],
): DrawProgress {
	if (mode.kind === 'edit') {
		return {
			drawType: mode.type,
			vertexCount: countRingVertices(mode.rings),
			// The same covers-ground rule a draw runs, read off the rings as edited,
			// the open sketch folded in.
			canFinish: editedPartsOf(mode) !== null,
			// A sketch is always something to take back, even before it has a vertex:
			// Undo is what closes an empty one.
			canUndo: mode.sketch !== null || mode.history.length > 0,
		};
	}
	return {
		drawType: mode.kind === 'draw' ? mode.type : null,
		vertexCount: vertices.length,
		canFinish:
			mode.kind === 'draw' && draftPart(mode, committed, dedupeTrailing(vertices)) !== null,
		canUndo: vertices.length > vertexFloor(mode),
	};
}

/** `vertices` with its last one dropped, unless that would go below `floor`. */
export function poppedTo(
	vertices: readonly PlanarPosition[],
	floor: number,
): readonly PlanarPosition[] {
	return vertices.length <= floor ? vertices : vertices.slice(0, -1);
}

/** Whether a reshape line is open, which takes the pointer over completely. */
export function isSketching(mode: Mode): boolean {
	return mode.kind === 'edit' && mode.sketch !== null;
}

/**
 * Whether the cursor is trailing a segment, which a line, an area and a reshape
 * sketch all do.
 *
 * It is also what double-click answers to, so a sketch completes the way a draw
 * does rather than needing a gesture of its own.
 */
export function isRubberBanding(mode: Mode): boolean {
	if (mode.kind === 'edit') {
		return mode.sketch !== null;
	}
	return mode.kind === 'draw' && mode.type !== 'Point';
}

export function rejectPending(mode: Mode): void {
	if (mode.kind === 'point') {
		mode.reject(new Error('A new map request replaced this one.'));
	}
}
