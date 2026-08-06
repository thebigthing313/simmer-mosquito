import type { Map as MapboxMap } from 'mapbox-gl';
import {
	buildOutreachTileUrl,
	OUTREACH_INTERACTIVE_LAYER_IDS,
	OUTREACH_LAYER_IDS,
	OUTREACH_SELECTED_LAYER_IDS,
	OUTREACH_SOURCE_ID,
	type OutreachTileFilters,
	outreachTileLayers,
} from './outreach-tiles';
import { type TileLayerConfig, useTileLayer } from './use-tile-layer';

export type OutreachTileLayerConfig = TileLayerConfig<OutreachTileFilters>;

const binding = {
	sourceId: OUTREACH_SOURCE_ID,
	buildTileUrl: buildOutreachTileUrl,
	buildLayers: outreachTileLayers,
	interactiveLayerIds: OUTREACH_INTERACTIVE_LAYER_IDS,
	allLayerIds: OUTREACH_LAYER_IDS,
	selectedLayerIds: OUTREACH_SELECTED_LAYER_IDS,
};

/**
 * Binds the outreach action vector-tile source and layers to a live Mapbox map.
 * See {@link useTileLayer} for the lifecycle this shares with every other
 * tileset. A no-op when `config` is undefined.
 */
export function useOutreachTileLayer(
	map: MapboxMap | null,
	isLoaded: boolean,
	config: OutreachTileLayerConfig | undefined,
): void {
	useTileLayer(map, isLoaded, config, binding);
}
