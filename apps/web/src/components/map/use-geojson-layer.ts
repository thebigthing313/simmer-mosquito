import type {
	CircleLayerSpecification,
	ExpressionSpecification,
	FillLayerSpecification,
	GeoJSONSource,
	LineLayerSpecification,
	Map as MapboxMap,
} from 'mapbox-gl';
import { useEffect, useRef } from 'react';

/**
 * A single GeoJSON overlay rendered on top of the basemap — the new-stack
 * equivalent of the legacy `MapView` geojson source. Used by record detail maps
 * to draw one feature's geometry (a habitat polygon/line/point) without the
 * vector-tile machinery the explorer needs.
 */
const GEOJSON_SOURCE_ID = 'geojson-overlay';

/** Match the explorer's selected-habitat highlight so the same record reads alike. */
const colors = {
	fill: '#16b364',
	outline: '#0c5331',
	line: '#2d46b6',
	point: '#16b364',
	pointStroke: '#f9fdfb',
} as const;

const polygonOnly: ExpressionSpecification = ['==', ['geometry-type'], 'Polygon'];
const lineOnly: ExpressionSpecification = ['==', ['geometry-type'], 'LineString'];
const pointOnly: ExpressionSpecification = ['==', ['geometry-type'], 'Point'];

const GEOJSON_LAYER_IDS = [
	`${GEOJSON_SOURCE_ID}-polygon-fill`,
	`${GEOJSON_SOURCE_ID}-polygon-outline`,
	`${GEOJSON_SOURCE_ID}-lines`,
	`${GEOJSON_SOURCE_ID}-points`,
] as const;

function geoJsonLayers(): (
	| FillLayerSpecification
	| LineLayerSpecification
	| CircleLayerSpecification
)[] {
	return [
		{
			id: `${GEOJSON_SOURCE_ID}-polygon-fill`,
			type: 'fill',
			source: GEOJSON_SOURCE_ID,
			filter: polygonOnly,
			paint: { 'fill-color': colors.fill, 'fill-opacity': 0.25 },
		},
		{
			id: `${GEOJSON_SOURCE_ID}-polygon-outline`,
			type: 'line',
			source: GEOJSON_SOURCE_ID,
			filter: polygonOnly,
			paint: { 'line-color': colors.outline, 'line-width': 2.5 },
		},
		{
			id: `${GEOJSON_SOURCE_ID}-lines`,
			type: 'line',
			source: GEOJSON_SOURCE_ID,
			filter: lineOnly,
			paint: { 'line-color': colors.line, 'line-width': 4 },
		},
		{
			id: `${GEOJSON_SOURCE_ID}-points`,
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
	];
}

/**
 * Binds a single GeoJSON source + layers to a live Mapbox map. Mirrors
 * {@link useHabitatTileLayer}: re-adds on basemap restyle (`style.load`), pushes
 * data updates through `setData` without re-adding layers, and guards teardown
 * against an already-removed map. A no-op while `data` is null.
 */
export function useGeoJsonLayer(
	map: MapboxMap | null,
	isLoaded: boolean,
	data: GeoJSON.GeoJSON | null,
): void {
	const enabled = data !== null;
	const dataRef = useRef(data);
	dataRef.current = data;

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
			for (const layer of geoJsonLayers()) {
				if (activeMap.getLayer(layer.id) === undefined) {
					activeMap.addLayer(layer);
				}
			}
		}

		ensureLayers();
		// setStyle (basemap switch) wipes custom sources/layers — re-add when ready.
		activeMap.on('style.load', ensureLayers);

		return () => {
			activeMap.off('style.load', ensureLayers);
			// useMapboxMap's create-effect cleanup calls map.remove() and, on unmount,
			// runs before this hook's cleanup — touching the style/sources/layers
			// afterward throws. Guard the teardown.
			try {
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
	}, [map, isLoaded, enabled]);

	// Push data changes onto the existing source without re-adding layers.
	useEffect(() => {
		if (map === null || !isLoaded || data === null) {
			return;
		}
		const source = map.getSource(GEOJSON_SOURCE_ID) as GeoJSONSource | undefined;
		source?.setData(data);
	}, [map, isLoaded, data]);
}
