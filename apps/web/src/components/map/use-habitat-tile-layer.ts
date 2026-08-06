import type { Map as MapboxMap } from 'mapbox-gl';
import {
	buildHabitatTileUrl,
	HABITAT_INTERACTIVE_LAYER_IDS,
	HABITAT_LAYER_IDS,
	HABITAT_SELECTED_LAYER_IDS,
	HABITAT_SOURCE_ID,
	type HabitatTileFilters,
	habitatTileLayers,
} from './habitat-tiles';
import { type TileLayerConfig, useTileLayer } from './use-tile-layer';

export type HabitatTileLayerConfig = TileLayerConfig<HabitatTileFilters>;

const binding = {
	sourceId: HABITAT_SOURCE_ID,
	buildTileUrl: buildHabitatTileUrl,
	buildLayers: habitatTileLayers,
	interactiveLayerIds: HABITAT_INTERACTIVE_LAYER_IDS,
	allLayerIds: HABITAT_LAYER_IDS,
	selectedLayerIds: HABITAT_SELECTED_LAYER_IDS,
};

/**
 * Binds the habitat vector-tile source and layers to a live Mapbox map.
 * See {@link useTileLayer} for the lifecycle this shares with every other
 * tileset. A no-op when `config` is undefined.
 */
export function useHabitatTileLayer(
	map: MapboxMap | null,
	isLoaded: boolean,
	config: HabitatTileLayerConfig | undefined,
): void {
	useTileLayer(map, isLoaded, config, binding);
}
