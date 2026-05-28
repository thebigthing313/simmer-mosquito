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
		if (map === null || !isLoaded) {
			return;
		}

		const existingSource = map.getSource(source.id);
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
			if (map.getLayer(layer.id) === undefined) {
				map.addLayer(layer);
			}
			map.setLayoutProperty(layer.id, 'visibility', visible ? 'visible' : 'none');
		}

		return () => {
			for (const layer of [...source.layers].reverse()) {
				if (map.getLayer(layer.id) !== undefined) {
					map.removeLayer(layer.id);
				}
			}
			if (map.getSource(source.id) !== undefined) {
				map.removeSource(source.id);
			}
		};
	}, [isLoaded, map, source, visible]);
}
