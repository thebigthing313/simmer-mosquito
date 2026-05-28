import type { Map as MapboxMap, MapMouseEvent } from 'mapbox-gl';
import { useEffect } from 'react';
import type { MapFeatureClick, MapFeatureClickEvent } from '../types';

export function useMapClickFeatures(options: {
	readonly layerIds: readonly string[];
	readonly map: MapboxMap | null;
	readonly onFeatureClick?: (event: MapFeatureClickEvent) => void;
}): void {
	useEffect(() => {
		if (
			options.map === null ||
			options.onFeatureClick === undefined ||
			options.layerIds.length === 0
		) {
			return;
		}

		function handleClick(event: MapMouseEvent) {
			if (options.map === null) {
				return;
			}

			const features = options.map.queryRenderedFeatures(event.point, {
				layers: [...options.layerIds],
			});
			if (features.length === 0) {
				return;
			}

			options.onFeatureClick?.({
				point: event.point,
				lngLat: [event.lngLat.lng, event.lngLat.lat],
				features: features.map((feature): MapFeatureClick => {
					return {
						id: feature.id,
						source: feature.source ?? '',
						sourceLayer: feature.sourceLayer,
						layerId: feature.layer?.id ?? '',
						geometryType: feature.geometry.type,
						properties: feature.properties ?? {},
						rawFeature: feature,
					};
				}),
				originalEvent: event,
			});
		}

		options.map.on('click', handleClick);

		return () => {
			options.map?.off('click', handleClick);
		};
	}, [options.layerIds, options.map, options.onFeatureClick]);
}
