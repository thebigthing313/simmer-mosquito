import type {
	CircleLayerSpecification,
	ExpressionSpecification,
	FillLayerSpecification,
	LineLayerSpecification,
	Map as MapboxMap,
} from 'mapbox-gl';
import { useEffect, useRef } from 'react';
import { useGeoJsonSource } from './use-geojson-source';
import { isMapLive } from './use-mapbox-map';

/**
 * A single GeoJSON overlay rendered on top of the basemap — the new-stack
 * equivalent of the legacy `MapView` geojson source. Used by record detail maps
 * to draw one feature's geometry (a habitat polygon/line/point) without the
 * vector-tile machinery the explorer needs, and by the adult-surveillance
 * explorers to draw many owned points with click-to-select wiring.
 */
const GEOJSON_SOURCE_ID = 'geojson-overlay';

/** Match the explorer's selected-habitat highlight so the same record reads alike. */
const colors = {
	fill: '#16b364',
	outline: '#0c5331',
	line: '#2d46b6',
	point: '#16b364',
	pointStroke: '#f9fdfb',
	selected: '#0c5331',
} as const;

/**
 * A point draws in its own `color` property when it has one, and in the shared
 * green when it does not.
 *
 * The overlay carries two kinds of load: one record's geometry on a detail map,
 * where a single colour is the point, and a whole explorer's worth of points,
 * where the record's state is worth reading at a glance. Opting in per feature
 * keeps the first kind untouched.
 */
const pointColor: ExpressionSpecification = ['coalesce', ['get', 'color'], colors.point];

const polygonOnly: ExpressionSpecification = ['==', ['geometry-type'], 'Polygon'];
const lineOnly: ExpressionSpecification = ['==', ['geometry-type'], 'LineString'];
const pointOnly: ExpressionSpecification = ['==', ['geometry-type'], 'Point'];

const POLYGON_FILL_LAYER_ID = `${GEOJSON_SOURCE_ID}-polygon-fill`;
const POLYGON_OUTLINE_LAYER_ID = `${GEOJSON_SOURCE_ID}-polygon-outline`;
const LINE_LAYER_ID = `${GEOJSON_SOURCE_ID}-lines`;
const POINT_LAYER_ID = `${GEOJSON_SOURCE_ID}-points`;
const POINT_SELECTED_LAYER_ID = `${GEOJSON_SOURCE_ID}-points-selected`;

/** Layers a click/hover query targets to resolve the feature under the cursor. */
const INTERACTIVE_LAYER_IDS = [POINT_LAYER_ID, LINE_LAYER_ID, POLYGON_FILL_LAYER_ID] as const;

/** A sentinel no real feature id ever equals, so the highlight is hidden by default. */
const NO_SELECTION = '__no-selection__';

/**
 * Match the currently-selected point by its `id` property. We compare the `id`
 * property (not the native feature id via `['id']`) because callers key features
 * with domain UUIDs, which Mapbox does not preserve as the native feature id for
 * GeoJSON sources — same reason the MVT layers promote `id`.
 */
function selectedPointFilter(selectedId: string | null): ExpressionSpecification {
	return ['all', pointOnly, ['==', ['get', 'id'], selectedId ?? NO_SELECTION]];
}

/**
 * Opt-in click-to-select wiring for the overlay. Presence of this config binds
 * click + hover handlers and draws a highlight around the selected point; detail
 * maps that only render one static feature omit it and keep the plain overlay.
 */
export interface GeoJsonLayerInteraction {
	/** Currently selected feature id; drives the on-map highlight. */
	readonly selectedId?: string | null;
	/** Fired with a feature id on click, or null when clicking empty map. */
	readonly onSelectFeature?: (id: string | null) => void;
}

function geoJsonLayers(
	selectedId: string | null,
): (FillLayerSpecification | LineLayerSpecification | CircleLayerSpecification)[] {
	return [
		{
			id: POLYGON_FILL_LAYER_ID,
			type: 'fill',
			source: GEOJSON_SOURCE_ID,
			filter: polygonOnly,
			paint: { 'fill-color': colors.fill, 'fill-opacity': 0.25 },
		},
		{
			id: POLYGON_OUTLINE_LAYER_ID,
			type: 'line',
			source: GEOJSON_SOURCE_ID,
			filter: polygonOnly,
			paint: { 'line-color': colors.outline, 'line-width': 2.5 },
		},
		{
			id: LINE_LAYER_ID,
			type: 'line',
			source: GEOJSON_SOURCE_ID,
			filter: lineOnly,
			paint: { 'line-color': colors.line, 'line-width': 4 },
		},
		{
			id: POINT_LAYER_ID,
			type: 'circle',
			source: GEOJSON_SOURCE_ID,
			filter: pointOnly,
			paint: {
				'circle-color': pointColor,
				'circle-radius': 7,
				'circle-stroke-color': colors.pointStroke,
				'circle-stroke-width': 2,
			},
		},
		{
			// Drawn last so the selected point reads above its neighbours.
			id: POINT_SELECTED_LAYER_ID,
			type: 'circle',
			source: GEOJSON_SOURCE_ID,
			filter: selectedPointFilter(selectedId),
			paint: {
				'circle-color': colors.selected,
				'circle-radius': 10,
				'circle-stroke-color': colors.pointStroke,
				'circle-stroke-width': 3,
			},
		},
	];
}

/**
 * Binds a single GeoJSON overlay to a live Mapbox map.
 *
 * The source lifecycle is {@link useGeoJsonSource}'s. What is here is what makes
 * this overlay itself: its layer specs, and the highlight that follows the
 * selected feature without the layers being re-added underneath it.
 */
export function useGeoJsonLayer(
	map: MapboxMap | null,
	isLoaded: boolean,
	data: GeoJSON.GeoJSON | null,
	interaction?: GeoJsonLayerInteraction,
): void {
	const enabled = data !== null;
	const selectedId = interaction?.selectedId ?? null;

	// The layer builder reads the selection at ensure time, so a new selection
	// re-filters the highlight (below) instead of re-adding every layer.
	const selectedRef = useRef(selectedId);
	selectedRef.current = selectedId;

	useGeoJsonSource({
		map,
		isLoaded,
		sourceId: GEOJSON_SOURCE_ID,
		data,
		layers: () => geoJsonLayers(selectedRef.current),
		interactive: {
			layerIds: INTERACTIVE_LAYER_IDS,
			...(interaction?.onSelectFeature === undefined
				? {}
				: { onSelectFeature: interaction.onSelectFeature }),
		},
	});

	// Re-scope the highlight to the selected feature without re-adding it.
	useEffect(() => {
		if (!isMapLive(map) || !isLoaded || !enabled) {
			return;
		}
		// getLayer/setFilter throw if the style was torn down under a reconnect or
		// restyle; the source hook re-applies the selection on `style.load`.
		try {
			if (map.getLayer(POINT_SELECTED_LAYER_ID) !== undefined) {
				map.setFilter(POINT_SELECTED_LAYER_ID, selectedPointFilter(selectedId));
			}
		} catch {
			// Map style not available; nothing to re-scope.
		}
	}, [map, isLoaded, enabled, selectedId]);
}
