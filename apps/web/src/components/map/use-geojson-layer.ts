import type {
	CircleLayerSpecification,
	ExpressionSpecification,
	FillLayerSpecification,
	GeoJSONSource,
	LineLayerSpecification,
	Map as MapboxMap,
	MapMouseEvent,
} from 'mapbox-gl';
import { useEffect, useRef } from 'react';

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

const polygonOnly: ExpressionSpecification = ['==', ['geometry-type'], 'Polygon'];
const lineOnly: ExpressionSpecification = ['==', ['geometry-type'], 'LineString'];
const pointOnly: ExpressionSpecification = ['==', ['geometry-type'], 'Point'];

const POLYGON_FILL_LAYER_ID = `${GEOJSON_SOURCE_ID}-polygon-fill`;
const POLYGON_OUTLINE_LAYER_ID = `${GEOJSON_SOURCE_ID}-polygon-outline`;
const LINE_LAYER_ID = `${GEOJSON_SOURCE_ID}-lines`;
const POINT_LAYER_ID = `${GEOJSON_SOURCE_ID}-points`;
const POINT_SELECTED_LAYER_ID = `${GEOJSON_SOURCE_ID}-points-selected`;

const GEOJSON_LAYER_IDS = [
	POLYGON_FILL_LAYER_ID,
	POLYGON_OUTLINE_LAYER_ID,
	LINE_LAYER_ID,
	POINT_LAYER_ID,
	POINT_SELECTED_LAYER_ID,
] as const;

/** Layers a click/hover query targets to resolve the feature under the cursor. */
const INTERACTIVE_LAYER_IDS = [POINT_LAYER_ID, LINE_LAYER_ID, POLYGON_FILL_LAYER_ID] as const;

/** A sentinel no real feature id ever equals, so the highlight is hidden by default. */
const NO_SELECTION = '__no-selection__';

/** Match the currently-selected point by its feature id. */
function selectedPointFilter(selectedId: string | null): ExpressionSpecification {
	return ['all', pointOnly, ['==', ['id'], selectedId ?? NO_SELECTION]];
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
				'circle-color': colors.point,
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
 * Binds a single GeoJSON source + layers to a live Mapbox map. Mirrors
 * {@link useHabitatTileLayer}: re-adds on basemap restyle (`style.load`), pushes
 * data updates through `setData` without re-adding layers, and guards teardown
 * against an already-removed map. A no-op while `data` is null. When
 * `interaction` is supplied, routes clicks/hover on features back out through
 * `onSelectFeature` and keeps the selected-point highlight in sync.
 */
export function useGeoJsonLayer(
	map: MapboxMap | null,
	isLoaded: boolean,
	data: GeoJSON.GeoJSON | null,
	interaction?: GeoJsonLayerInteraction,
): void {
	const enabled = data !== null;
	const interactive = interaction?.onSelectFeature !== undefined;
	const selectedId = interaction?.selectedId ?? null;

	const dataRef = useRef(data);
	dataRef.current = data;
	const selectedRef = useRef(selectedId);
	selectedRef.current = selectedId;
	const onSelectRef = useRef(interaction?.onSelectFeature);
	onSelectRef.current = interaction?.onSelectFeature;

	// Source + layers + interaction. Re-runs only on map identity / load / enable
	// / interactivity — never on selection or data changes (handled below).
	useEffect(() => {
		if (map === null || !isLoaded || !enabled) {
			return;
		}
		const activeMap = map;

		function ensureLayers() {
			const current = dataRef.current;
			if (current === null) {
				return;
			}
			const source = activeMap.getSource(GEOJSON_SOURCE_ID) as GeoJSONSource | undefined;
			if (source === undefined) {
				activeMap.addSource(GEOJSON_SOURCE_ID, { type: 'geojson', data: current });
			} else {
				source.setData(current);
			}
			for (const layer of geoJsonLayers(selectedRef.current)) {
				if (activeMap.getLayer(layer.id) === undefined) {
					activeMap.addLayer(layer);
				}
			}
		}

		ensureLayers();
		// setStyle (basemap switch) wipes custom sources/layers — re-add when ready.
		activeMap.on('style.load', ensureLayers);

		function presentInteractiveLayers(): string[] {
			return INTERACTIVE_LAYER_IDS.filter((id) => activeMap.getLayer(id) !== undefined);
		}
		function handleClick(event: MapMouseEvent) {
			const layers = presentInteractiveLayers();
			if (layers.length === 0) {
				return;
			}
			const feature = activeMap.queryRenderedFeatures(event.point, { layers })[0];
			const id = feature === undefined || feature.id === undefined ? null : String(feature.id);
			onSelectRef.current?.(id);
		}
		function handleMove(event: MapMouseEvent) {
			const layers = presentInteractiveLayers();
			if (layers.length === 0) {
				return;
			}
			const hovering = activeMap.queryRenderedFeatures(event.point, { layers }).length > 0;
			activeMap.getCanvas().style.cursor = hovering ? 'pointer' : '';
		}
		if (interactive) {
			activeMap.on('click', handleClick);
			activeMap.on('mousemove', handleMove);
		}

		return () => {
			activeMap.off('style.load', ensureLayers);
			if (interactive) {
				activeMap.off('click', handleClick);
				activeMap.off('mousemove', handleMove);
			}
			// useMapboxMap's create-effect cleanup calls map.remove() and, on unmount,
			// runs before this hook's cleanup — touching the canvas/style/sources/layers
			// afterward throws. Guard the teardown.
			try {
				if (interactive) {
					activeMap.getCanvas().style.cursor = '';
				}
				for (const id of GEOJSON_LAYER_IDS) {
					if (activeMap.getLayer(id) !== undefined) {
						activeMap.removeLayer(id);
					}
				}
				if (activeMap.getSource(GEOJSON_SOURCE_ID) !== undefined) {
					activeMap.removeSource(GEOJSON_SOURCE_ID);
				}
			} catch {
				// Map already removed; nothing left to clean up.
			}
		};
	}, [map, isLoaded, enabled, interactive]);

	// Push data changes onto the existing source without re-adding layers.
	useEffect(() => {
		if (map === null || !isLoaded || data === null) {
			return;
		}
		const source = map.getSource(GEOJSON_SOURCE_ID) as GeoJSONSource | undefined;
		source?.setData(data);
	}, [map, isLoaded, data]);

	// Re-scope the highlight layer to the selected feature without re-adding it.
	useEffect(() => {
		if (map === null || !isLoaded || map.getLayer(POINT_SELECTED_LAYER_ID) === undefined) {
			return;
		}
		map.setFilter(POINT_SELECTED_LAYER_ID, selectedPointFilter(selectedId));
	}, [map, isLoaded, selectedId]);
}
