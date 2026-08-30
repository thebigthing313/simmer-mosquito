import type {
	CircleLayerSpecification,
	ExpressionSpecification,
	FillLayerSpecification,
	LineLayerSpecification,
	Map as MapboxMap,
} from 'mapbox-gl';
import { useEffect } from 'react';
import { useGeoJsonSource } from './use-geojson-source';
import { isMapLive } from './use-mapbox-map';

/**
 * The service-request context overlay: a proximity ring, the request's own
 * marker, and the nearby operational records colored by family. It renders a
 * bespoke, role-discriminated feature set the generic overlay cannot express,
 * which is why it is its own hook; the source lifecycle underneath it is
 * {@link useGeoJsonSource}'s, shared with every other overlay.
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

/**
 * Which nearby points wear the selection ring.
 *
 * A list rather than one id, because a habitat merge selects several at once and
 * a single-selection filter would show a ring on whichever was clicked last. The
 * sentinel keeps an empty list from matching a feature with no id.
 */
function selectedFilter(selectedIds: readonly string[]): ExpressionSpecification {
	const ids = selectedIds.length === 0 ? [NO_SELECTION] : [...selectedIds];
	return ['all', nearbyOnly, ['in', ['get', 'id'], ['literal', ids]]];
}

export interface NearbyLayerConfig {
	/** Ring + center + nearby features, each tagged with a `role` property. */
	readonly data: GeoJSON.GeoJSON | null;
	/** Currently selected nearby record ids; drives the on-map highlight. */
	readonly selectedIds?: readonly string[];
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
			filter: selectedFilter([]),
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
	const data = config?.data ?? null;
	const enabled = data !== null;
	const selectedIds = config?.selectedIds;
	// Joined rather than passed as an array, because a caller that rebuilds the
	// list every render would otherwise re-run the effect on every render.
	const selectionKey = (selectedIds ?? []).join(',');

	useGeoJsonSource({
		map,
		isLoaded,
		sourceId: SOURCE_ID,
		data,
		layers: nearbyLayers,
		// Only the points answer to a pointer: the ring is context and the centre
		// is the record the ring is drawn around.
		interactive: {
			layerIds: [POINTS_LAYER_ID],
			...(config?.onSelectFeature === undefined ? {} : { onSelectFeature: config.onSelectFeature }),
		},
	});

	// Re-scope the selection highlight without re-adding the layer.
	useEffect(() => {
		if (!isMapLive(map) || !isLoaded || !enabled) {
			return;
		}
		try {
			if (map.getLayer(SELECTED_LAYER_ID) !== undefined) {
				map.setFilter(
					SELECTED_LAYER_ID,
					selectedFilter(selectionKey === '' ? [] : selectionKey.split(',')),
				);
			}
		} catch {
			// Map style not available; nothing to re-scope.
		}
	}, [map, isLoaded, enabled, selectionKey]);
}
