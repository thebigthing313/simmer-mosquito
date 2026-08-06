import type { Map as MapboxMap } from 'mapbox-gl';
import {
	buildSourceReductionTileUrl,
	SOURCE_REDUCTION_INTERACTIVE_LAYER_IDS,
	SOURCE_REDUCTION_LAYER_IDS,
	SOURCE_REDUCTION_SELECTED_LAYER_IDS,
	SOURCE_REDUCTION_SOURCE_ID,
	type SourceReductionTileFilters,
	sourceReductionTileLayers,
} from './source-reduction-tiles';
import { type TileLayerConfig, useTileLayer } from './use-tile-layer';

export type SourceReductionTileLayerConfig = TileLayerConfig<SourceReductionTileFilters>;

const binding = {
	sourceId: SOURCE_REDUCTION_SOURCE_ID,
	buildTileUrl: buildSourceReductionTileUrl,
	buildLayers: sourceReductionTileLayers,
	interactiveLayerIds: SOURCE_REDUCTION_INTERACTIVE_LAYER_IDS,
	allLayerIds: SOURCE_REDUCTION_LAYER_IDS,
	selectedLayerIds: SOURCE_REDUCTION_SELECTED_LAYER_IDS,
};

/**
 * Binds the source-reduction activity vector-tile source and layers to a live Mapbox map.
 * See {@link useTileLayer} for the lifecycle this shares with every other
 * tileset. A no-op when `config` is undefined.
 */
export function useSourceReductionTileLayer(
	map: MapboxMap | null,
	isLoaded: boolean,
	config: SourceReductionTileLayerConfig | undefined,
): void {
	useTileLayer(map, isLoaded, config, binding);
}
