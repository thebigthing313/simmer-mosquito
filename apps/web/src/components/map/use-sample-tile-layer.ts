import type { Map as MapboxMap } from 'mapbox-gl';
import {
	buildSampleTileUrl,
	SAMPLE_INTERACTIVE_LAYER_IDS,
	SAMPLE_LAYER_IDS,
	SAMPLE_SELECTED_LAYER_IDS,
	SAMPLE_SOURCE_ID,
	type SampleTileFilters,
	sampleTileLayers,
} from './sample-tiles';
import { type TileLayerConfig, useTileLayer } from './use-tile-layer';

export type SampleTileLayerConfig = TileLayerConfig<SampleTileFilters>;

const binding = {
	sourceId: SAMPLE_SOURCE_ID,
	buildTileUrl: buildSampleTileUrl,
	buildLayers: sampleTileLayers,
	interactiveLayerIds: SAMPLE_INTERACTIVE_LAYER_IDS,
	allLayerIds: SAMPLE_LAYER_IDS,
	selectedLayerIds: SAMPLE_SELECTED_LAYER_IDS,
};

/**
 * Binds the sample vector-tile source and layers to a live Mapbox map.
 * See {@link useTileLayer} for the lifecycle this shares with every other
 * tileset. A no-op when `config` is undefined.
 */
export function useSampleTileLayer(
	map: MapboxMap | null,
	isLoaded: boolean,
	config: SampleTileLayerConfig | undefined,
): void {
	useTileLayer(map, isLoaded, config, binding);
}
