import type { Map as MapboxMap } from 'mapbox-gl';
import {
	selectionOverlayLayer,
	selectionOverlaySourceId,
} from '../../components/map/geometry-tiles';
import {
	type MapTileLayer,
	tileLayerBinding,
	tileLayerSelectionOverlay,
} from '../../components/map/tile-layers';
import type { TileDrawOptions } from '../../components/map/tile-urls';
import { useGeoJsonSource } from './use-geojson-source';

/**
 * Draws the selected record's own point above a clustered tileset, below the
 * zoom the tiles stop clustering at, so a record folded into a cluster still
 * shows where it is.
 *
 * Takes the same tile layer entry and draw options `useTileLayer` draws with,
 * `draw.cluster` being the map's clustering setting, and reads the point off
 * the record the entry carries as `selectedRecord`. Nothing is added while
 * `tileLayerSelectionOverlay` answers null, and clearing the selection takes the
 * source and its layer back off. Call it after `useTileLayer`, which answers a
 * click on the overlay as a click on the record.
 */
export function useSelectionOverlayLayer(
	map: MapboxMap | null,
	isLoaded: boolean,
	layer: MapTileLayer,
	draw: TileDrawOptions,
): void {
	const { sourceId } = tileLayerBinding(layer);
	useGeoJsonSource({
		map,
		isLoaded,
		sourceId: selectionOverlaySourceId(sourceId),
		data: tileLayerSelectionOverlay(layer, draw),
		layers: () => [selectionOverlayLayer(sourceId)],
	});
}
