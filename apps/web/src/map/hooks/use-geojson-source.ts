import type { GeoJSONSource, Map as MapboxMap } from 'mapbox-gl';
import { useEffect } from 'react';
import type { GeoJsonSourceDefinition } from '../types';

export function useGeoJsonSource(
	map: MapboxMap | null,
	isLoaded: boolean,
	source: GeoJsonSourceDefinition,
	visible = true,
): void {
	useEffect(() => {
		if (map === null || !isLoaded || !canReadMapStyle(map)) {
			return;
		}

		const existingSource = getMapSource(map, source.id);
		if (existingSource === undefined) {
			map.addSource(source.id, {
				type: 'geojson',
				data: source.data,
				...(source.generateId === undefined ? {} : { generateId: source.generateId }),
				...(source.promoteId === undefined ? {} : { promoteId: source.promoteId }),
			});
		} else {
			(existingSource as GeoJSONSource).setData(source.data);
		}

		for (const layer of source.layers) {
			if (getMapLayer(map, layer.id) === undefined) {
				map.addLayer(layer);
			}
			map.setLayoutProperty(layer.id, 'visibility', visible ? 'visible' : 'none');
		}

		return () => {
			// The map may already be torn down (e.g. the MapView unmounted) by the
			// time this cleanup runs, leaving map.style undefined.
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
