import { mapContext } from '@simmer-mosquito/design-tokens';
import type {
	ExpressionSpecification,
	FillLayerSpecification,
	GeoJSONSource,
	LineLayerSpecification,
	Map as MapboxMap,
} from 'mapbox-gl';
import { useEffect, useRef } from 'react';

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

const CONTEXT_LAYER_IDS = [
	CONTEXT_FILL_LAYER_ID,
	CONTEXT_OUTLINE_LAYER_ID,
	CONTEXT_LINE_LAYER_ID,
] as const;

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
 * Binds the context source + layers to a live Mapbox map, mirroring
 * {@link useGeoJsonLayer}'s lifecycle: re-add on basemap restyle, push updates
 * through `setData`, and guard teardown against an already-removed map.
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
			const source = activeMap.getSource(CONTEXT_SOURCE_ID) as GeoJSONSource | undefined;
			if (source === undefined) {
				activeMap.addSource(CONTEXT_SOURCE_ID, { type: 'geojson', data: current });
			} else {
				source.setData(current);
			}
			for (const layer of contextLayers()) {
				if (activeMap.getLayer(layer.id) === undefined) {
					activeMap.addLayer(layer);
				}
			}
		}

		ensureLayers();
		activeMap.on('style.load', ensureLayers);

		return () => {
			activeMap.off('style.load', ensureLayers);
			// useMapboxMap's create-effect cleanup calls map.remove() before this on
			// unmount; touching the style afterwards throws.
			try {
				for (const id of CONTEXT_LAYER_IDS) {
					if (activeMap.getLayer(id) !== undefined) {
						activeMap.removeLayer(id);
					}
				}
				if (activeMap.getSource(CONTEXT_SOURCE_ID) !== undefined) {
					activeMap.removeSource(CONTEXT_SOURCE_ID);
				}
			} catch {
				// Map already removed; nothing left to clean up.
			}
		};
	}, [map, isLoaded, enabled]);

	useEffect(() => {
		if (map === null || !isLoaded || data === null || !enabled) {
			return;
		}
		try {
			const source = map.getSource(CONTEXT_SOURCE_ID) as GeoJSONSource | undefined;
			source?.setData(data);
		} catch {
			// Map style not available; the setup effect re-seeds on `style.load`.
		}
	}, [map, isLoaded, enabled, data]);
}
