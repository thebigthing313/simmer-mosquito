import { mapContext } from '@simmer-mosquito/design-tokens';
import type {
	ExpressionSpecification,
	FillLayerSpecification,
	LineLayerSpecification,
	Map as MapboxMap,
} from 'mapbox-gl';
import type { MapSourceGeoJson } from '../../components/map/geojson-adapter';
import { useGeoJsonSource } from './use-geojson-source';

const CONTEXT_SOURCE_ID = 'geojson-context';

/** Neutral, not the overlay's green/blue; context must not read as a record. */
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
 * Binds the context source and layers to a live Mapbox map: a dashed, unfilled,
 * non-interactive outline drawn beneath the record's own geometry.
 *
 * Call it before `useGeoJsonLayer` in a component. Mapbox appends layers in the
 * order they are added and effects run in hook order, so registering the
 * context first is what keeps the record's own geometry on top.
 */
export function useContextGeoJsonLayer(
	map: MapboxMap | null,
	isLoaded: boolean,
	data: MapSourceGeoJson | null,
): void {
	useGeoJsonSource({
		map,
		isLoaded,
		sourceId: CONTEXT_SOURCE_ID,
		data,
		layers: contextLayers,
	});
}
