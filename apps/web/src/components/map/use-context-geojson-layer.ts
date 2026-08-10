import { mapContext } from '@simmer-mosquito/design-tokens';
import type {
	ExpressionSpecification,
	FillLayerSpecification,
	LineLayerSpecification,
	Map as MapboxMap,
} from 'mapbox-gl';
import { useGeoJsonSource } from './use-geojson-source';

/**
 * A second, deliberately quiet GeoJSON overlay drawn *beneath* the record's own
 * geometry (see {@link useGeoJsonLayer}).
 *
 * Detail maps show one record, but a record performed against a habitat is only
 * legible in that habitat's outline — a treated stretch inside a ditch means
 * nothing floating on a basemap, and an action that copied its habitat's shape
 * still needs the habitat named. This layer carries that surrounding feature:
 * dashed, unfilled, and non-interactive, so it reads as context rather than as a
 * second record competing for attention.
 */
const CONTEXT_SOURCE_ID = 'geojson-context';

/** Neutral, not the overlay's green/blue — context must not read as a record. */
const colors = mapContext;

const polygonOnly: ExpressionSpecification = ['==', ['geometry-type'], 'Polygon'];
const lineOnly: ExpressionSpecification = ['==', ['geometry-type'], 'LineString'];

const CONTEXT_FILL_LAYER_ID = `${CONTEXT_SOURCE_ID}-polygon-fill`;
const CONTEXT_OUTLINE_LAYER_ID = `${CONTEXT_SOURCE_ID}-polygon-outline`;
const CONTEXT_LINE_LAYER_ID = `${CONTEXT_SOURCE_ID}-lines`;

/**
 * Points are omitted on purpose: a context point and a record point at the same
 * place are indistinguishable, and the record's marker is the one that matters.
 */
function contextLayers(): (FillLayerSpecification | LineLayerSpecification)[] {
	return [
		{
			id: CONTEXT_FILL_LAYER_ID,
			type: 'fill',
			source: CONTEXT_SOURCE_ID,
			filter: polygonOnly,
			paint: { 'fill-color': colors.fill, 'fill-opacity': 0.1 },
		},
		{
			id: CONTEXT_OUTLINE_LAYER_ID,
			type: 'line',
			source: CONTEXT_SOURCE_ID,
			filter: polygonOnly,
			paint: { 'line-color': colors.outline, 'line-width': 1.5, 'line-dasharray': [2, 2] },
		},
		{
			id: CONTEXT_LINE_LAYER_ID,
			type: 'line',
			source: CONTEXT_SOURCE_ID,
			filter: lineOnly,
			paint: { 'line-color': colors.outline, 'line-width': 2.5, 'line-dasharray': [2, 2] },
		},
	];
}

/**
 * Binds the context source + layers to a live Mapbox map.
 *
 * Call this *before* `useGeoJsonLayer` in a component. Mapbox appends layers in
 * the order they are added and effects run in hook order, so registering the
 * context first is what keeps the record's own geometry on top.
 */
export function useContextGeoJsonLayer(
	map: MapboxMap | null,
	isLoaded: boolean,
	data: GeoJSON.GeoJSON | null,
): void {
	useGeoJsonSource({
		map,
		isLoaded,
		sourceId: CONTEXT_SOURCE_ID,
		data,
		layers: contextLayers,
	});
}
