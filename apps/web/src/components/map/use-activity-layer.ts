import type {
	CircleLayerSpecification,
	ExpressionSpecification,
	Map as MapboxMap,
} from 'mapbox-gl';
import { useEffect } from 'react';
import { useGeoJsonSource } from './use-geojson-source';
import { isMapLive } from './use-mapbox-map';

/**
 * One Profile's field work as a pin cloud, coloured by the family the record
 * belongs to and ringed where the person only assisted.
 *
 * The caller supplies one FeatureCollection of points, each carrying
 * `{ id, recordId, category, family, involvement }`, where `id` is the entry's
 * synthetic key rather than the record's. A collection set on Monday and
 * collected on Thursday is two entries sharing one record id, so keying
 * selection on the record would light up both pins and open the wrong day —
 * the card resolves `recordId` for itself.
 */
const SOURCE_ID = 'profile-activity';
const POINTS_LAYER_ID = `${SOURCE_ID}-points`;
const ASSISTING_LAYER_ID = `${SOURCE_ID}-assisting`;
const SELECTED_LAYER_ID = `${SOURCE_ID}-selected`;

/**
 * The four families, in colour.
 *
 * Scoped to this feature rather than shared with the nearby overlay: that one
 * cuts the same records three ways (infrastructure / surveillance / control),
 * which is a different taxonomy, and widening it would leave one palette
 * answering to two meanings. Exported so the count chips and the list dots read
 * the same source the map paints from — the counts are the legend.
 */
export const ACTIVITY_FAMILY_COLORS = {
	larval: '#1f9d63',
	adult: '#9333a8',
	control: '#2f56c9',
	publicEngagement: '#d9822b',
} as const;

const SELECTED_RING = '#0c1b12';
const NO_SELECTION = '__no-selection__';

const assistingOnly: ExpressionSpecification = ['==', ['get', 'involvement'], 'assisting'];

const familyColor: ExpressionSpecification = [
	'match',
	['get', 'family'],
	'larval',
	ACTIVITY_FAMILY_COLORS.larval,
	'adult',
	ACTIVITY_FAMILY_COLORS.adult,
	'control',
	ACTIVITY_FAMILY_COLORS.control,
	'publicEngagement',
	ACTIVITY_FAMILY_COLORS.publicEngagement,
	'#6b7280',
];

// `['get', 'id']` rather than `['id']`: the second reads a feature id, which a
// GeoJSON source does not keep for string ids.
function selectedFilter(selectedKey: string | null): ExpressionSpecification {
	return ['==', ['get', 'id'], selectedKey ?? NO_SELECTION];
}

export interface ActivityLayerConfig {
	/** The activity points. `null` leaves the layer unmounted entirely. */
	readonly data: GeoJSON.GeoJSON | null;
	/** The selected entry's key; drives the on-map highlight. */
	readonly selectedKey?: string | null;
	/** Fired with an entry key on click, or null when clicking empty map. */
	readonly onSelectFeature?: (entryKey: string | null) => void;
}

function activityLayers(): CircleLayerSpecification[] {
	return [
		{
			id: POINTS_LAYER_ID,
			type: 'circle',
			source: SOURCE_ID,
			paint: {
				'circle-color': familyColor,
				'circle-radius': 6,
				'circle-stroke-color': '#ffffff',
				'circle-stroke-width': 1.5,
			},
		},
		{
			// Assisting work reads hollow: rode along, rather than ran it. The
			// white centre is drawn over the filled point beneath.
			id: ASSISTING_LAYER_ID,
			type: 'circle',
			source: SOURCE_ID,
			filter: assistingOnly,
			paint: {
				'circle-color': '#ffffff',
				'circle-radius': 3,
				'circle-stroke-color': familyColor,
				'circle-stroke-width': 0,
			},
		},
		{
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
	];
}

export function useActivityLayer(
	map: MapboxMap | null,
	isLoaded: boolean,
	config?: ActivityLayerConfig,
): void {
	const data = config?.data ?? null;
	const enabled = data !== null;
	const selectedKey = config?.selectedKey ?? null;

	useGeoJsonSource({
		map,
		isLoaded,
		sourceId: SOURCE_ID,
		data,
		layers: activityLayers,
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
				map.setFilter(SELECTED_LAYER_ID, selectedFilter(selectedKey));
			}
		} catch {
			// Map style not available; nothing to re-scope.
		}
	}, [map, isLoaded, enabled, selectedKey]);
}
