import type { Map as MapboxMap } from 'mapbox-gl';
import {
	buildTrapTileUrl,
	TRAP_INTERACTIVE_LAYER_IDS,
	TRAP_LAYER_IDS,
	TRAP_SELECTED_LAYER_IDS,
	TRAP_SOURCE_ID,
	type TrapTileFilters,
	trapTileLayers,
} from './trap-tiles';
import { type TileLayerConfig, useTileLayer } from './use-tile-layer';

export type TrapTileLayerConfig = TileLayerConfig<TrapTileFilters>;

const binding = {
	sourceId: TRAP_SOURCE_ID,
	buildTileUrl: buildTrapTileUrl,
	buildLayers: trapTileLayers,
	interactiveLayerIds: TRAP_INTERACTIVE_LAYER_IDS,
	allLayerIds: TRAP_LAYER_IDS,
	selectedLayerIds: TRAP_SELECTED_LAYER_IDS,
};

/**
 * Binds the trap vector-tile source and layers to a live Mapbox map.
 * See {@link useTileLayer} for the lifecycle this shares with every other
 * tileset. A no-op when `config` is undefined.
 */
export function useTrapTileLayer(
	map: MapboxMap | null,
	isLoaded: boolean,
	config: TrapTileLayerConfig | undefined,
): void {
	useTileLayer(map, isLoaded, config, binding);
}
