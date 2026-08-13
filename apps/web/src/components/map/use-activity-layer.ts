import { mapFamily, mapInteraction } from '@simmer-mosquito/design-tokens';
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

const NO_SELECTION = '__no-selection__';

const assistingOnly: ExpressionSpecification = ['==', ['get', 'involvement'], 'assisting'];

const familyColor: ExpressionSpecification = [
	'match',
	['get', 'family'],
	'larval',
	mapFamily.larval,
	'adult',
	mapFamily.adult,
	'control',
	mapFamily.control,
	'publicEngagement',
	mapFamily.publicEngagement,
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
				'circle-stroke-color': mapInteraction.pointStroke,
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
				'circle-color': mapInteraction.pointStroke,
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
			// Amber, like selection on every other layer — DESIGN.md's One Selection
			// Rule. A near-black halo here would mean selection said something
			// different depending on which surface the operator clicked from.
			paint: {
				'circle-color': 'rgba(0,0,0,0)',
				'circle-radius': 10,
				'circle-stroke-color': mapInteraction.selected,
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
