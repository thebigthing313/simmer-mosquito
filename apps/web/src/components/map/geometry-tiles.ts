/**
 * The layer stack every record tileset draws.
 *
 * Nine domains — habitats, traps, collections, inspections, samples, chemical
 * applications, source reduction, biocontrol, outreach — render the same eight
 * GL layers over the same three geometry types: a polygon fill and outline, a
 * line, a point, and four highlight layers scoped to the selected feature. Only
 * the tileset name and the palette differ, and inspections and samples colour
 * their points by a data ramp instead of a flat domain colour.
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

import { mapInteraction } from '@simmer-mosquito/design-tokens';
import type {
	CircleLayerSpecification,
	ExpressionSpecification,
	FillLayerSpecification,
	LineLayerSpecification,
} from 'mapbox-gl';

export type GeometryTileLayer =
	| FillLayerSpecification
	| LineLayerSpecification
	| CircleLayerSpecification;

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

const polygonOnly: ExpressionSpecification = ['==', ['geometry-type'], 'Polygon'];
const lineOnly: ExpressionSpecification = ['==', ['geometry-type'], 'LineString'];
const pointOnly: ExpressionSpecification = ['==', ['geometry-type'], 'Point'];

/** Layers the user can click to select a record. Order = hit priority. */
export function interactiveLayerIds(sourceId: string): readonly string[] {
	return [`${sourceId}-points`, `${sourceId}-lines`, `${sourceId}-polygon-fill`];
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
		...selectedLayerIds(sourceId),
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
