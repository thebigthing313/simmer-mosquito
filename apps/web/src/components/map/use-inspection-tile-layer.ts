import type { Map as MapboxMap } from 'mapbox-gl';
import {
	buildInspectionTileUrl,
	INSPECTION_INTERACTIVE_LAYER_IDS,
	INSPECTION_LAYER_IDS,
	INSPECTION_SELECTED_LAYER_IDS,
	INSPECTION_SOURCE_ID,
	type InspectionTileFilters,
	inspectionTileLayers,
} from './inspection-tiles';
import { type TileLayerConfig, useTileLayer } from './use-tile-layer';

export type InspectionTileLayerConfig = TileLayerConfig<InspectionTileFilters>;

const binding = {
	sourceId: INSPECTION_SOURCE_ID,
	buildTileUrl: buildInspectionTileUrl,
	buildLayers: inspectionTileLayers,
	interactiveLayerIds: INSPECTION_INTERACTIVE_LAYER_IDS,
	allLayerIds: INSPECTION_LAYER_IDS,
	selectedLayerIds: INSPECTION_SELECTED_LAYER_IDS,
};

/**
 * Binds the inspection vector-tile source and layers to a live Mapbox map.
 * See {@link useTileLayer} for the lifecycle this shares with every other
 * tileset. A no-op when `config` is undefined.
 */
export function useInspectionTileLayer(
	map: MapboxMap | null,
	isLoaded: boolean,
	config: InspectionTileLayerConfig | undefined,
): void {
	useTileLayer(map, isLoaded, config, binding);
}
