import { mapInteraction } from '@simmer-mosquito/design-tokens';
import type { DrawVertexRef } from '@simmer-mosquito/mapping';
import type {
	CircleLayerSpecification,
	ExpressionSpecification,
	FillLayerSpecification,
	LineLayerSpecification,
	Map as MapboxMap,
	MapMouseEvent,
	PointLike,
} from 'mapbox-gl';
import { drawFeatureFlag, drawFeatureIs, readDrawFeatureProperty } from './draw-feature-properties';

export const SOURCE_ID = 'habitat-draw';

// Amber draft styling, deliberately distinct from the green reference habitats
// (vector tiles) and the blue detail overlay, so "the new/edited site" reads as
// its own active layer at a glance.
//
// These are the shared selection colours, not a private amber: the thing being
// drawn *is* the selected spatial context, and it has to match the selection
// halo the tile layers paint so the two never disagree on screen.
const draft = {
	fill: mapInteraction.selected,
	outline: mapInteraction.selectedStroke,
	line: mapInteraction.selected,
	vertex: mapInteraction.selected,
	vertexStroke: mapInteraction.vertexStroke,
	point: mapInteraction.selected,
	pointStroke: mapInteraction.pointStroke,
	refused: mapInteraction.refused,
	refusedStroke: mapInteraction.refusedStroke,
} as const;

const isPolygon: ExpressionSpecification = ['==', ['geometry-type'], 'Polygon'];
const isLine: ExpressionSpecification = ['==', ['geometry-type'], 'LineString'];
const isVertex: ExpressionSpecification = drawFeatureIs('role', 'vertex');
const isPoint: ExpressionSpecification = drawFeatureIs('role', 'point');

/**
 * Which part the pointer is over, picked out by weight rather than by a second
 * colour. A part is not a different kind of thing from the shape it belongs to,
 * so hovering a row thickens and fills it instead of recolouring it.
 */
function whenHighlighted(highlighted: number, rest: number): ExpressionSpecification {
	return ['case', drawFeatureFlag('highlighted'), highlighted, rest];
}

/**
 * The colour a draft paints in, red while the control would refuse it.
 *
 * Refusal is the one state that does get its own colour rather than more weight:
 * a hole that has wandered outside its piece is not a piece of the shape being
 * picked out, it is a shape that cannot be saved.
 */
function whenRefused(refused: string, rest: string): ExpressionSpecification {
	return ['case', drawFeatureFlag('refused'), refused, rest];
}

export function drawLayers(): (
	| FillLayerSpecification
	| LineLayerSpecification
	| CircleLayerSpecification
)[] {
	return [
		{
			id: `${SOURCE_ID}-fill`,
			type: 'fill',
			source: SOURCE_ID,
			filter: isPolygon,
			paint: {
				'fill-color': whenRefused(draft.refused, draft.fill),
				'fill-opacity': whenHighlighted(0.42, 0.18),
			},
		},
		{
			id: `${SOURCE_ID}-outline`,
			type: 'line',
			source: SOURCE_ID,
			filter: isPolygon,
			layout: { 'line-join': 'round' },
			paint: {
				'line-color': whenRefused(draft.refusedStroke, draft.outline),
				'line-width': whenHighlighted(4.5, 2.5),
			},
		},
		{
			id: `${SOURCE_ID}-line`,
			type: 'line',
			source: SOURCE_ID,
			filter: isLine,
			layout: { 'line-join': 'round', 'line-cap': 'round' },
			paint: {
				'line-color': whenRefused(draft.refused, draft.line),
				'line-width': whenHighlighted(5, 3),
				'line-dasharray': [2, 1],
			},
		},
		{
			id: `${SOURCE_ID}-vertex`,
			type: 'circle',
			source: SOURCE_ID,
			filter: isVertex,
			paint: {
				'circle-color': whenRefused(draft.refused, draft.vertex),
				// Weight, not a second colour, so the vertex an edit has picked reads
				// the way a highlighted piece does. Refusal is the only state that
				// gets a colour of its own.
				'circle-radius': whenHighlighted(7.5, 5),
				'circle-stroke-color': draft.vertexStroke,
				'circle-stroke-width': 2,
			},
		},
		{
			id: `${SOURCE_ID}-point`,
			type: 'circle',
			source: SOURCE_ID,
			filter: isPoint,
			paint: {
				'circle-color': draft.point,
				'circle-radius': whenHighlighted(11, 8),
				'circle-stroke-color': draft.pointStroke,
				'circle-stroke-width': 3,
			},
		},
	];
}

/**
 * How far from the pointer a vertex or an edge still counts as under it, in
 * pixels. A 5px circle is a small thing to hit with a mouse and a smaller one
 * with a thumb.
 */
const HIT_TOLERANCE = 8;

const VERTEX_LAYER = `${SOURCE_ID}-vertex`;
/** The layers a part's own boundary draws on, which is where an edge is clicked. */
const EDGE_LAYERS = [`${SOURCE_ID}-outline`, `${SOURCE_ID}-line`];

/** The vertex under the pointer, read off the feature the map answers with. */
export function vertexUnder(map: MapboxMap, event: MapMouseEvent): DrawVertexRef | null {
	const [feature] = map.queryRenderedFeatures(hitBox(event), { layers: [VERTEX_LAYER] });
	const ring = readDrawFeatureProperty(feature, 'ring');
	const vertex = readDrawFeatureProperty(feature, 'vertex');
	return typeof ring === 'number' && typeof vertex === 'number' ? { ring, vertex } : null;
}

/** Whether the pointer is on a boundary rather than inside or outside a shape. */
export function isOverEdge(map: MapboxMap, event: MapMouseEvent): boolean {
	return map.queryRenderedFeatures(hitBox(event), { layers: EDGE_LAYERS }).length > 0;
}

function hitBox(event: MapMouseEvent): [PointLike, PointLike] {
	const { x, y } = event.point;
	return [
		[x - HIT_TOLERANCE, y - HIT_TOLERANCE],
		[x + HIT_TOLERANCE, y + HIT_TOLERANCE],
	];
}
