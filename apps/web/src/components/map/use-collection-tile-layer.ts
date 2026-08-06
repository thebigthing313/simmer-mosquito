import type { Map as MapboxMap } from 'mapbox-gl';
import {
	buildCollectionTileUrl,
	COLLECTION_INTERACTIVE_LAYER_IDS,
	COLLECTION_LAYER_IDS,
	COLLECTION_SELECTED_LAYER_IDS,
	COLLECTION_SOURCE_ID,
	type CollectionTileFilters,
	collectionTileLayers,
} from './collection-tiles';
import { type TileLayerConfig, useTileLayer } from './use-tile-layer';

export type CollectionTileLayerConfig = TileLayerConfig<CollectionTileFilters>;

const binding = {
	sourceId: COLLECTION_SOURCE_ID,
	buildTileUrl: buildCollectionTileUrl,
	buildLayers: collectionTileLayers,
	interactiveLayerIds: COLLECTION_INTERACTIVE_LAYER_IDS,
	allLayerIds: COLLECTION_LAYER_IDS,
	selectedLayerIds: COLLECTION_SELECTED_LAYER_IDS,
};

/**
 * Binds the collection vector-tile source and layers to a live Mapbox map.
 * See {@link useTileLayer} for the lifecycle this shares with every other
 * tileset. A no-op when `config` is undefined.
 */
export function useCollectionTileLayer(
	map: MapboxMap | null,
	isLoaded: boolean,
	config: CollectionTileLayerConfig | undefined,
): void {
	useTileLayer(map, isLoaded, config, binding);
}
