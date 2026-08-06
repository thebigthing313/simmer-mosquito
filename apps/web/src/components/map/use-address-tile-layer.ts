import type { Map as MapboxMap } from 'mapbox-gl';
import {
	ADDRESS_INTERACTIVE_LAYER_IDS,
	ADDRESS_LAYER_IDS,
	ADDRESS_SELECTED_LAYER_IDS,
	ADDRESS_SOURCE_ID,
	type AddressTileFilters,
	addressTileLayers,
	buildAddressTileUrl,
} from './address-tiles';
import { type TileLayerConfig, useTileLayer } from './use-tile-layer';

export type AddressTileLayerConfig = TileLayerConfig<AddressTileFilters>;

const binding = {
	sourceId: ADDRESS_SOURCE_ID,
	buildTileUrl: buildAddressTileUrl,
	buildLayers: addressTileLayers,
	interactiveLayerIds: ADDRESS_INTERACTIVE_LAYER_IDS,
	allLayerIds: ADDRESS_LAYER_IDS,
	selectedLayerIds: ADDRESS_SELECTED_LAYER_IDS,
};

/**
 * Binds the address vector-tile source and layers to a live Mapbox map.
 * See {@link useTileLayer} for the lifecycle this shares with every other
 * tileset. A no-op when `config` is undefined.
 */
export function useAddressTileLayer(
	map: MapboxMap | null,
	isLoaded: boolean,
	config: AddressTileLayerConfig | undefined,
): void {
	useTileLayer(map, isLoaded, config, binding);
}
