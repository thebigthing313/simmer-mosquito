/**
 * The layer stack every record tileset draws.
 *
 * Nine domains render the same ten GL layers: habitats, traps, collections,
 * inspections, samples, chemical applications, source reduction, biocontrol and
 * outreach, over the same three geometry types: a polygon fill and outline, a
 * line, a point, a cluster circle and its count, and four highlight layers
 * scoped to the selected feature. Only the tileset name and the palette differ,
 * and inspections and samples colour their points by a data ramp instead of a
 * flat domain colour. A cluster takes none of that: every tileset paints its
 * clusters in the one {@link TILE_CLUSTER_COLOR}, because a cluster can hold
 * records in several states or bands at once, and because the count drawn on
 * it reads on the slate and not on most domain hues. The two cluster layers
 * draw only when the tiles were asked for clusters and are empty otherwise.
 *
 * This existed as nine near-identical copies. That is how habitat selection
 * broke: `e0bcd8e` fixed the render-time selection filter across seven of them
 * and missed `habitat-tiles`, so clicking a habitat drew no highlight for
 * months while every other explorer worked. One definition is the fix that
 * stays fixed.
 *
 * The filter → query-param mapping stays per-domain and is not shared: those
 * params genuinely differ per endpoint. See `tile-urls.ts`.
 */

import { mapCluster, mapInteraction } from '@simmer-mosquito/design-tokens';
import type {
	CircleLayerSpecification,
	ExpressionSpecification,
	FillLayerSpecification,
	LineLayerSpecification,
	SymbolLayerSpecification,
} from 'mapbox-gl';

export type GeometryTileLayer =
	| FillLayerSpecification
	| LineLayerSpecification
	| CircleLayerSpecification
	| SymbolLayerSpecification;

/**
 * A colour a layer paints with: a literal, or an expression reading it off the
 * feature — trap `isActive`, larval density, sample status.
 */
export type TileColor = string | ExpressionSpecification;

/**
 * The colours one tileset draws with.
 *
 * Four slots because that is how many the nine tilesets actually distinguish;
 * most set only `fill` and `line` and let the other two default. Everything else
 * about the stack — opacity, radius, width, zoom interpolation, the highlight
 * layers — is fixed, and is the part that had drifted between copies.
 */
export interface GeometryTilePalette {
	/** Polygon interiors, and the default for `outline` and `point`. */
	readonly fill: TileColor;
	/** Polygon borders. Defaults to `fill`. */
	readonly outline?: TileColor | undefined;
	/** Standalone LineString features. */
	readonly line: TileColor;
	/** Point features. Defaults to `fill`. */
	readonly point?: TileColor | undefined;
}

/**
 * What a cluster circle paints, and the only place a legend reads it from.
 * Every tileset draws its clusters in this one colour, whatever its own palette:
 * the off-white count holds 9.15:1 on it, where it holds 3.19:1 on the source
 * reduction mark and 3.22:1 on the biocontrol one.
 */
export const TILE_CLUSTER_COLOR = mapCluster.fill;

const polygonOnly: ExpressionSpecification = ['==', ['geometry-type'], 'Polygon'];
const lineOnly: ExpressionSpecification = ['==', ['geometry-type'], 'LineString'];
/**
 * A clustered tile marks a cluster with `cluster: true` and writes no such key
 * on a record, so the presence of the key is the whole test.
 */
const clusterOnly: ExpressionSpecification = ['has', 'cluster'];
/**
 * A record rather than a cluster. Exported for the Addresses stack, whose point
 * layer would otherwise draw every cluster as an address.
 */
export const recordOnly: ExpressionSpecification = ['!', clusterOnly];
/** A record's own point: a cluster is drawn as a point too, by its own layer. */
const pointOnly: ExpressionSpecification = ['all', ['==', ['geometry-type'], 'Point'], recordOnly];

/**
 * Layers the user can click, in hit priority: a cluster, which zooms in, then
 * the three a record is selected from.
 */
export function interactiveLayerIds(sourceId: string): readonly string[] {
	return [
		`${sourceId}-clusters`,
		`${sourceId}-points`,
		`${sourceId}-lines`,
		`${sourceId}-polygon-fill`,
	];
}

/** The highlight layers, drawn above the base stack. */
function selectedLayerIds(sourceId: string): readonly string[] {
	return [
		`${sourceId}-selected-fill`,
		`${sourceId}-selected-outline`,
		`${sourceId}-selected-line`,
		`${sourceId}-selected-point`,
	];
}

/** Every layer the tileset owns, base stack first then highlights. */
export function allLayerIds(sourceId: string): readonly string[] {
	return [
		`${sourceId}-polygon-fill`,
		`${sourceId}-polygon-outline`,
		`${sourceId}-lines`,
		`${sourceId}-points`,
		`${sourceId}-clusters`,
		`${sourceId}-cluster-counts`,
		...selectedLayerIds(sourceId),
	];
}

/**
 * The cluster circle and its count, drawn from the features a clustered tile
 * marks `cluster: true`. Exported for the one tileset that builds its own stack,
 * Addresses, so its clusters draw the way every other tileset's do.
 */
export function clusterTileLayers(
	sourceId: string,
): [CircleLayerSpecification, SymbolLayerSpecification] {
	return [
		{
			id: `${sourceId}-clusters`,
			type: 'circle',
			source: sourceId,
			'source-layer': sourceId,
			filter: clusterOnly,
			paint: {
				'circle-color': TILE_CLUSTER_COLOR,
				'circle-opacity': 0.9,
				// Wider as the count grows, in steps so a circle does not resize
				// between two counts nobody could tell apart.
				'circle-radius': ['step', ['get', 'point_count'], 11, 10, 14, 50, 18, 200, 22],
				'circle-stroke-color': mapCluster.stroke,
				'circle-stroke-width': 1.5,
			},
		},
		{
			id: `${sourceId}-cluster-counts`,
			type: 'symbol',
			source: sourceId,
			'source-layer': sourceId,
			filter: clusterOnly,
			layout: {
				'text-field': ['to-string', ['get', 'point_count']],
				'text-font': ['DIN Pro Bold', 'Arial Unicode MS Bold'],
				'text-size': 12,
				'text-allow-overlap': true,
				'text-ignore-placement': true,
			},
			paint: { 'text-color': mapCluster.label },
		},
	];
}

/**
 * Build the GL layers for one tileset. `selectedId` drives the highlight set.
 *
 * The source layer always matches the source id — every one of these tilesets
 * names its single MVT layer after itself.
 */
export function geometryTileLayers(
	sourceId: string,
	palette: GeometryTilePalette,
	selectedId: string | null,
): GeometryTileLayer[] {
	// Match the `id` property, not the feature id: tiles use the 4-arg ST_AsMVT
	// (no native feature id) and promoteId doesn't reach render-time filters, so
	// `['id']` evaluates to undefined here. An id no feature can carry keeps this
	// empty when nothing is selected.
	const matchesSelected: ExpressionSpecification = ['==', ['get', 'id'], selectedId ?? ' '];
	const selectedPolygon: ExpressionSpecification = ['all', polygonOnly, matchesSelected];
	const selectedLine: ExpressionSpecification = ['all', lineOnly, matchesSelected];
	const selectedPoint: ExpressionSpecification = ['all', pointOnly, matchesSelected];

	const outlineColor = palette.outline ?? palette.fill;
	const pointColor = palette.point ?? palette.fill;

	return [
		{
			id: `${sourceId}-polygon-fill`,
			type: 'fill',
			source: sourceId,
			'source-layer': sourceId,
			filter: polygonOnly,
			paint: { 'fill-color': palette.fill, 'fill-opacity': 0.24 },
		},
		{
			id: `${sourceId}-polygon-outline`,
			type: 'line',
			source: sourceId,
			'source-layer': sourceId,
			filter: polygonOnly,
			paint: {
				'line-color': outlineColor,
				'line-opacity': 0.8,
				'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.8, 16, 2],
			},
		},
		{
			id: `${sourceId}-lines`,
			type: 'line',
			source: sourceId,
			'source-layer': sourceId,
			filter: lineOnly,
			paint: {
				'line-color': palette.line,
				'line-opacity': 0.82,
				'line-width': ['interpolate', ['linear'], ['zoom'], 10, 1.2, 16, 3],
			},
		},
		{
			id: `${sourceId}-points`,
			type: 'circle',
			source: sourceId,
			'source-layer': sourceId,
			filter: pointOnly,
			paint: {
				'circle-color': pointColor,
				'circle-opacity': 0.92,
				'circle-radius': ['interpolate', ['linear'], ['zoom'], 9, 3, 16, 6.5],
				'circle-stroke-color': mapInteraction.pointStroke,
				'circle-stroke-width': 1.2,
			},
		},
		...clusterTileLayers(sourceId),
		// --- selection highlight: drawn on top, scoped to the selected feature ---
		{
			id: `${sourceId}-selected-fill`,
			type: 'fill',
			source: sourceId,
			'source-layer': sourceId,
			filter: selectedPolygon,
			paint: { 'fill-color': mapInteraction.selected, 'fill-opacity': 0.3 },
		},
		{
			id: `${sourceId}-selected-outline`,
			type: 'line',
			source: sourceId,
			'source-layer': sourceId,
			filter: selectedPolygon,
			paint: { 'line-color': mapInteraction.selected, 'line-width': 3 },
		},
		{
			id: `${sourceId}-selected-line`,
			type: 'line',
			source: sourceId,
			'source-layer': sourceId,
			filter: selectedLine,
			paint: { 'line-color': mapInteraction.selected, 'line-width': 5 },
		},
		{
			id: `${sourceId}-selected-point`,
			type: 'circle',
			source: sourceId,
			'source-layer': sourceId,
			filter: selectedPoint,
			paint: {
				'circle-color': mapInteraction.selected,
				'circle-radius': ['interpolate', ['linear'], ['zoom'], 9, 6, 16, 10],
				'circle-stroke-color': mapInteraction.pointStroke,
				'circle-stroke-width': 2.5,
			},
		},
	];
}
