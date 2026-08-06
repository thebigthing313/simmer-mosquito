import type { Map as MapboxMap } from 'mapbox-gl';
import {
	buildChemicalTileUrl,
	CHEMICAL_INTERACTIVE_LAYER_IDS,
	CHEMICAL_LAYER_IDS,
	CHEMICAL_SELECTED_LAYER_IDS,
	CHEMICAL_SOURCE_ID,
	type ChemicalTileFilters,
	chemicalTileLayers,
} from './chemical-tiles';
import { type TileLayerConfig, useTileLayer } from './use-tile-layer';

export type ChemicalTileLayerConfig = TileLayerConfig<ChemicalTileFilters>;

const binding = {
	sourceId: CHEMICAL_SOURCE_ID,
	buildTileUrl: buildChemicalTileUrl,
	buildLayers: chemicalTileLayers,
	interactiveLayerIds: CHEMICAL_INTERACTIVE_LAYER_IDS,
	allLayerIds: CHEMICAL_LAYER_IDS,
	selectedLayerIds: CHEMICAL_SELECTED_LAYER_IDS,
};

/**
 * Binds the chemical application vector-tile source and layers to a live Mapbox map.
 * See {@link useTileLayer} for the lifecycle this shares with every other
 * tileset. A no-op when `config` is undefined.
 */
export function useChemicalTileLayer(
	map: MapboxMap | null,
	isLoaded: boolean,
	config: ChemicalTileLayerConfig | undefined,
): void {
	useTileLayer(map, isLoaded, config, binding);
}
