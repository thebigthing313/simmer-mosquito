import type { Map as MapboxMap } from 'mapbox-gl';
import {
	BIOCONTROL_INTERACTIVE_LAYER_IDS,
	BIOCONTROL_LAYER_IDS,
	BIOCONTROL_SELECTED_LAYER_IDS,
	BIOCONTROL_SOURCE_ID,
	type BiocontrolTileFilters,
	biocontrolTileLayers,
	buildBiocontrolTileUrl,
} from './biocontrol-tiles';
import { type TileLayerConfig, useTileLayer } from './use-tile-layer';

export type BiocontrolTileLayerConfig = TileLayerConfig<BiocontrolTileFilters>;

const binding = {
	sourceId: BIOCONTROL_SOURCE_ID,
	buildTileUrl: buildBiocontrolTileUrl,
	buildLayers: biocontrolTileLayers,
	interactiveLayerIds: BIOCONTROL_INTERACTIVE_LAYER_IDS,
	allLayerIds: BIOCONTROL_LAYER_IDS,
	selectedLayerIds: BIOCONTROL_SELECTED_LAYER_IDS,
};

/**
 * Binds the biocontrol action vector-tile source and layers to a live Mapbox map.
 * See {@link useTileLayer} for the lifecycle this shares with every other
 * tileset. A no-op when `config` is undefined.
 */
export function useBiocontrolTileLayer(
	map: MapboxMap | null,
	isLoaded: boolean,
	config: BiocontrolTileLayerConfig | undefined,
): void {
	useTileLayer(map, isLoaded, config, binding);
}
