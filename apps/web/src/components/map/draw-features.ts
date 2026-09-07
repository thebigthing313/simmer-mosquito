/**
 * What the draw control puts in its GeoJSON source: the committed pieces, the
 * shape in progress over the top of them, and every corner as a vertex to grab.
 *
 * Its own module beside `./draw-parts` because building features is a second
 * question from deciding what the shape is, and it has its own vocabulary: a
 * feature carries `role`, `refused`, `highlighted`, `ring` and `vertex`, which
 * `drawLayers` paints by and the pointer hit-test reads off. Nothing here
 * decides whether a gesture may land; it asks {@link editProblem} and the two
 * draft readers and paints the answer.
 *
 * No Mapbox GL import and no React. The one thing it hands to the renderer's
 * vocabulary goes through `./geojson-adapter`, which is where that conversion
 * lives (#624).
 */

import { closeRing, moveRingVertex, type PlanarPosition } from '@simmer-mosquito/mapping';
import {
	continuedHoles,
	continuedPartOf,
	type DrawDrag,
	type DrawGeometry,
	type DrawGeometryType,
	type DrawMode,
	type DrawPartGeometry,
	drawParts,
	type EditMode,
	editedRings,
	editProblem,
	holeDraftOf,
	type Mode,
	withHoles,
} from './draw-parts';
import { toMapboxGeometry } from './geojson-adapter';

const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

/**
 * Every committed part, plus the part being drawn over the top of them.
 *
 * The committed parts stay on the map through an add and through a hole, so the
 * user places the new ring against what is already there. A replace has already
 * cleared them. A continuation and an edit are the two cases that hide a
 * committed part: the draft is that part, and drawing both would put a finished
 * outline under a changing one.
 */
export function buildFeatures({
	committed,
	mode,
	vertices,
	cursor,
	drag,
	highlighted,
}: {
	readonly committed: DrawGeometry | null;
	readonly mode: Mode;
	readonly vertices: readonly PlanarPosition[];
	readonly cursor: PlanarPosition | null;
	readonly drag: DrawDrag | null;
	readonly highlighted: number | null;
}): GeoJSON.FeatureCollection {
	const features: GeoJSON.Feature[] = [];
	const drafted = draftedPartIndex(mode);
	drawParts(committed).forEach((part, index) => {
		if (index !== drafted) {
			features.push(...partFeatures(part, index === highlighted));
		}
	});

	if (mode.kind === 'draw') {
		features.push(...draftFeatures(mode, committed, vertices, cursor));
	}
	if (mode.kind === 'edit') {
		features.push(...editFeatures(mode, drag, cursor));
	}

	return features.length === 0 ? EMPTY : { type: 'FeatureCollection', features };
}

/** Which committed part the draft has taken over drawing, if any. */
function draftedPartIndex(mode: Mode): number | null {
	if (mode.kind === 'edit') {
		return mode.partIndex;
	}
	return mode.kind === 'draw' && mode.target.kind === 'continue' ? mode.target.partIndex : null;
}

/**
 * The part being edited: its rings as they stand, and every corner of every one
 * of them as a vertex to grab.
 *
 * A vertex carries the ring and the index it sits at, so the pointer hit-test
 * reads the target off the feature rather than searching the rings for the
 * nearest position. The vertex being dragged is drawn under the cursor before
 * the move lands, which is what makes the drag look like one.
 *
 * A sketch previews the same way: the pieces drawn are the ones the sketch would
 * leave, the cursor included, so the result is on the map before the sketch is
 * finished. A split draws both of them. The sketch itself is drawn over the top,
 * so what was traced and what it did are both visible.
 */
function editFeatures(
	mode: EditMode,
	drag: DrawDrag | null,
	cursor: PlanarPosition | null,
): GeoJSON.Feature[] {
	const dragged =
		drag === null
			? mode.rings
			: (moveRingVertex(mode.rings, drag.vertex, drag.position) ?? mode.rings);
	const parts = editedRings({ ...mode, rings: dragged }, cursor) ?? [dragged];
	const refused = editProblem({ ...mode, rings: dragged }) !== null;
	return [
		...parts.flatMap((rings) => {
			const [shell = [], ...holes] = rings;
			const shape = previewShape(mode.type, shell);
			const preview = shape === null ? null : withHoles(shape, holes.map(closeRing));
			return preview === null ? [] : [geometryFeature(preview, false, refused)];
		}),
		...parts.flatMap((rings) =>
			rings.flatMap((ring, ringIndex) =>
				ring.map((position, vertexIndex) =>
					pointFeature(position, {
						role: 'vertex',
						refused,
						ring: ringIndex,
						vertex: vertexIndex,
						highlighted: mode.selected?.ring === ringIndex && mode.selected.vertex === vertexIndex,
					}),
				),
			),
		),
		...sketchFeatures(mode, cursor, refused),
	];
}

/**
 * The sketched line as traced, with the cursor on the end of it.
 *
 * Drawn over the previewed pieces rather than instead of them, because a sketch
 * that has not done its job leaves the shape as it was and the line is the only
 * thing on screen saying why.
 */
function sketchFeatures(
	mode: EditMode,
	cursor: PlanarPosition | null,
	refused: boolean,
): GeoJSON.Feature[] {
	if (mode.sketch === null) {
		return [];
	}
	const placed = mode.sketch.positions;
	const traced = cursor === null ? placed : [...placed, cursor];
	return [
		...(traced.length < 2
			? []
			: [geometryFeature({ type: 'LineString', coordinates: traced }, false, refused)]),
		...placed.map((position) => pointFeature(position, { role: 'vertex', refused })),
	];
}

/**
 * The shape in progress: the vertices placed so far, and the rubber band running
 * from the last of them to the cursor.
 *
 * A hole the control would refuse paints red, so the refusal is on the map and
 * not only under the Finish button. A point places nothing until it is committed,
 * so it draws none of this.
 */
function draftFeatures(
	mode: DrawMode,
	committed: DrawGeometry | null,
	vertices: readonly PlanarPosition[],
	cursor: PlanarPosition | null,
): GeoJSON.Feature[] {
	if (mode.type === 'Point') {
		return [];
	}
	const refused =
		holeDraftOf(mode, committed, vertices)?.problem != null ||
		continuedPartOf(mode, committed, vertices)?.problem != null;
	const shape = previewShape(mode.type, cursor === null ? vertices : [...vertices, cursor]);
	// A continuation's holes ride along with the preview, corners and all, so
	// cutting one and then extending the outline does not look like the hole has
	// gone. Each ring is closed, so its repeated first position is not drawn twice.
	const holes = continuedHoles(mode, committed);
	const preview = shape === null ? null : withHoles(shape, holes);
	return [
		...(preview === null ? [] : [geometryFeature(preview, false, refused)]),
		...[...vertices, ...holes.flatMap((ring) => ring.slice(0, -1))].map((vertex) =>
			pointFeature(vertex, { role: 'vertex', refused }),
		),
	];
}

/**
 * What the placed vertices look like before they are a shape: an area once three
 * of them close a ring, a line before that, and nothing at all below two.
 *
 * Deliberately not `shapeFromVertices`, which the algebra commits with. That one
 * refuses a polygon below three corners, because a shape with no area is not one
 * the record can hold; this one draws the trail so far as a line, because the
 * user is still placing it. Same shapes, opposite answer to "not enough yet".
 */
function previewShape(
	type: DrawGeometryType,
	preview: readonly PlanarPosition[],
): DrawPartGeometry | null {
	if (type === 'Polygon' && preview.length >= 3) {
		return { type: 'Polygon', coordinates: [closeRing(preview)] };
	}
	return preview.length < 2 ? null : { type: 'LineString', coordinates: preview };
}

function partFeatures(part: DrawPartGeometry, highlighted: boolean): GeoJSON.Feature[] {
	if (part.type === 'Point') {
		return [pointFeature(part.coordinates, { role: 'point', highlighted })];
	}
	if (part.type === 'LineString') {
		return [
			geometryFeature(part, highlighted),
			...part.coordinates.map((position) =>
				pointFeature(position, { role: 'vertex', highlighted }),
			),
		];
	}
	// Every ring, so a hole's corners can be seen and counted the way the outline's
	// are. Each ring is closed, so its repeated first position is not drawn twice.
	return [
		geometryFeature(part, highlighted),
		...part.coordinates.flatMap((ring) =>
			ring.slice(0, -1).map((position) => pointFeature(position, { role: 'vertex', highlighted })),
		),
	];
}

function geometryFeature(
	geometry: DrawGeometry,
	highlighted = false,
	refused = false,
): GeoJSON.Feature {
	return {
		type: 'Feature',
		properties: { highlighted, refused },
		geometry: toMapboxGeometry(geometry),
	};
}

/**
 * One position as its own feature, carrying whatever the layers and the pointer
 * hit-test read off it.
 *
 * Properties rather than a fixed argument list because an edit's vertices carry
 * two more of them, the ring and the index, and every expression in
 * {@link drawLayers} already falls back to false for a property a feature does
 * not have.
 */
function pointFeature(
	position: PlanarPosition,
	properties: GeoJSON.GeoJsonProperties,
): GeoJSON.Feature {
	return {
		type: 'Feature',
		properties,
		geometry: { type: 'Point', coordinates: [position[0], position[1]] },
	};
}
