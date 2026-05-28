import type { Map as MapboxMap } from 'mapbox-gl';
import { useEffect } from 'react';
import type { VectorTileSourceDefinition } from '../types';

export function useVectorTileSource(
	map: MapboxMap | null,
	isLoaded: boolean,
	source: VectorTileSourceDefinition,
	visible = true,
): void {
	useEffect(() => {
		if (map === null || !isLoaded || !canReadMapStyle(map)) {
			return;
		}

		if (getMapSource(map, source.id) === undefined) {
			map.addSource(source.id, {
				type: 'vector',
				tiles: [...source.tiles],
				...(source.minzoom === undefined ? {} : { minzoom: source.minzoom }),
				...(source.maxzoom === undefined ? {} : { maxzoom: source.maxzoom }),
				...(source.promoteId === undefined ? {} : { promoteId: source.promoteId }),
			});
		}

		for (const layer of source.layers) {
			if (getMapLayer(map, layer.id) === undefined) {
				map.addLayer(layer);
			}
			map.setLayoutProperty(layer.id, 'visibility', visible ? 'visible' : 'none');
		}

		return () => {
			if (!canReadMapStyle(map)) {
				return;
			}

			for (const layer of [...source.layers].reverse()) {
				if (getMapLayer(map, layer.id) !== undefined) {
					map.removeLayer(layer.id);
				}
			}
			if (getMapSource(map, source.id) !== undefined) {
				map.removeSource(source.id);
			}
		};
	}, [isLoaded, map, source, visible]);
}

function canReadMapStyle(map: MapboxMap): boolean {
	try {
		map.getStyle();
		return true;
	} catch {
		return false;
	}
}

function getMapLayer(map: MapboxMap, layerId: string): ReturnType<MapboxMap['getLayer']> {
	try {
		return map.getLayer(layerId);
	} catch {
		return undefined;
	}
}

function getMapSource(map: MapboxMap, sourceId: string): ReturnType<MapboxMap['getSource']> {
	try {
		return map.getSource(sourceId);
	} catch {
		return undefined;
	}
}
