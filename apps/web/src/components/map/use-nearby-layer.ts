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
 * The service-request context overlay: a proximity ring, the request's own
 * marker, and the nearby operational records colored by family. Mirrors
 * {@link useGeoJsonLayer}'s lifecycle (re-add on restyle, `setData` for updates,
 * guarded teardown) but renders a bespoke, role-discriminated feature set the
 * generic overlay can't express.
 *
 * The caller supplies one FeatureCollection whose features carry a `role`
 * (`ring` | `center` | `nearby`); nearby points additionally carry `family`
 * (`infrastructure` | `surveillance` | `control`) and `id`. Toggling families is
 * done by the caller omitting those features from `data`.
 */
const SOURCE_ID = 'nearby-context';
const RING_FILL_LAYER_ID = `${SOURCE_ID}-ring-fill`;
const RING_LINE_LAYER_ID = `${SOURCE_ID}-ring-line`;
const POINTS_LAYER_ID = `${SOURCE_ID}-points`;
const SELECTED_LAYER_ID = `${SOURCE_ID}-selected`;
const CENTER_LAYER_ID = `${SOURCE_ID}-center`;

const LAYER_IDS = [
	RING_FILL_LAYER_ID,
	RING_LINE_LAYER_ID,
	POINTS_LAYER_ID,
	SELECTED_LAYER_ID,
	CENTER_LAYER_ID,
] as const;

/** Family colors (hex approximations of the field-green / survey-purple / operations-blue tokens). */
export const NEARBY_FAMILY_COLORS = {
	infrastructure: '#1f9d63',
	surveillance: '#9333a8',
	control: '#2f56c9',
} as const;

const CENTER_COLOR = '#e0a92e';
const CENTER_STROKE = '#3a2c05';
const RING_COLOR = '#d9a441';
const SELECTED_RING = '#0c1b12';

const NO_SELECTION = '__no-selection__';

const ringOnly: ExpressionSpecification = ['==', ['get', 'role'], 'ring'];
const centerOnly: ExpressionSpecification = ['==', ['get', 'role'], 'center'];
const nearbyOnly: ExpressionSpecification = ['==', ['get', 'role'], 'nearby'];

const familyColor: ExpressionSpecification = [
	'match',
	['get', 'family'],
	'infrastructure',
	NEARBY_FAMILY_COLORS.infrastructure,
	'surveillance',
	NEARBY_FAMILY_COLORS.surveillance,
	'control',
	NEARBY_FAMILY_COLORS.control,
	'#6b7280',
];

function selectedFilter(selectedId: string | null): ExpressionSpecification {
	return ['all', nearbyOnly, ['==', ['get', 'id'], selectedId ?? NO_SELECTION]];
}

export interface NearbyLayerConfig {
	/** Ring + center + nearby features, each tagged with a `role` property. */
	readonly data: GeoJSON.GeoJSON | null;
	/** Currently selected nearby record id; drives the on-map highlight. */
	readonly selectedId?: string | null;
	/** Fired with a nearby record id on click, or null when clicking empty map. */
	readonly onSelectFeature?: (id: string | null) => void;
}

function nearbyLayers(): (
	| FillLayerSpecification
	| LineLayerSpecification
	| CircleLayerSpecification
)[] {
	return [
		{
			id: RING_FILL_LAYER_ID,
			type: 'fill',
			source: SOURCE_ID,
			filter: ringOnly,
			paint: { 'fill-color': RING_COLOR, 'fill-opacity': 0.06 },
		},
		{
			id: RING_LINE_LAYER_ID,
			type: 'line',
			source: SOURCE_ID,
			filter: ringOnly,
			paint: { 'line-color': RING_COLOR, 'line-width': 1.5, 'line-dasharray': [2, 2] },
		},
		{
			id: POINTS_LAYER_ID,
			type: 'circle',
			source: SOURCE_ID,
			filter: nearbyOnly,
			paint: {
				'circle-color': familyColor,
				'circle-radius': 6,
				'circle-stroke-color': '#ffffff',
				'circle-stroke-width': 1.5,
			},
		},
		{
			// A hollow ring around the selected nearby point; drawn above the points.
			id: SELECTED_LAYER_ID,
			type: 'circle',
			source: SOURCE_ID,
			filter: selectedFilter(null),
			paint: {
				'circle-color': 'rgba(0,0,0,0)',
				'circle-radius': 10,
				'circle-stroke-color': SELECTED_RING,
				'circle-stroke-width': 2.5,
			},
		},
		{
			// The request itself, distinct and drawn last so it reads on top.
			id: CENTER_LAYER_ID,
			type: 'circle',
			source: SOURCE_ID,
			filter: centerOnly,
			paint: {
				'circle-color': CENTER_COLOR,
				'circle-radius': 8,
				'circle-stroke-color': CENTER_STROKE,
				'circle-stroke-width': 2.5,
			},
		},
	];
}

export function useNearbyLayer(
	map: MapboxMap | null,
	isLoaded: boolean,
	config?: NearbyLayerConfig,
): void {
	const enabled = config?.data != null;
	const interactive = config?.onSelectFeature !== undefined;
	const selectedId = config?.selectedId ?? null;

	const dataRef = useRef(config?.data ?? null);
	dataRef.current = config?.data ?? null;
	const onSelectRef = useRef(config?.onSelectFeature);
	onSelectRef.current = config?.onSelectFeature;

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
			const source = activeMap.getSource(SOURCE_ID) as GeoJSONSource | undefined;
			if (source === undefined) {
				activeMap.addSource(SOURCE_ID, { type: 'geojson', data: current });
			} else {
				source.setData(current);
			}
			for (const layer of nearbyLayers()) {
				if (activeMap.getLayer(layer.id) === undefined) {
					activeMap.addLayer(layer);
				}
			}
		}

		ensureLayers();
		activeMap.on('style.load', ensureLayers);

		function handleClick(event: MapMouseEvent) {
			if (activeMap.getLayer(POINTS_LAYER_ID) === undefined) {
				return;
			}
			const feature = activeMap.queryRenderedFeatures(event.point, {
				layers: [POINTS_LAYER_ID],
			})[0];
			const rawId = feature?.properties?.id;
			onSelectRef.current?.(typeof rawId === 'string' ? rawId : null);
		}
		function handleMove(event: MapMouseEvent) {
			if (activeMap.getLayer(POINTS_LAYER_ID) === undefined) {
				return;
			}
			const hovering =
				activeMap.queryRenderedFeatures(event.point, { layers: [POINTS_LAYER_ID] }).length > 0;
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
			try {
				if (interactive) {
					activeMap.getCanvas().style.cursor = '';
				}
				for (const id of LAYER_IDS) {
					if (activeMap.getLayer(id) !== undefined) {
						activeMap.removeLayer(id);
					}
				}
				if (activeMap.getSource(SOURCE_ID) !== undefined) {
					activeMap.removeSource(SOURCE_ID);
				}
			} catch {
				// Map already removed; nothing left to clean up.
			}
		};
	}, [map, isLoaded, enabled, interactive]);

	// Push data changes onto the existing source without re-adding layers.
	const data = config?.data ?? null;
	useEffect(() => {
		if (map === null || !isLoaded || !enabled || data === null) {
			return;
		}
		try {
			const source = map.getSource(SOURCE_ID) as GeoJSONSource | undefined;
			source?.setData(data);
		} catch {
			// Map style not available; the setup effect re-seeds on style.load.
		}
	}, [map, isLoaded, enabled, data]);

	// Re-scope the selection highlight without re-adding the layer.
	useEffect(() => {
		if (map === null || !isLoaded || !enabled) {
			return;
		}
		try {
			if (map.getLayer(SELECTED_LAYER_ID) !== undefined) {
				map.setFilter(SELECTED_LAYER_ID, selectedFilter(selectedId));
			}
		} catch {
			// Map style not available; nothing to re-scope.
		}
	}, [map, isLoaded, enabled, selectedId]);
}
