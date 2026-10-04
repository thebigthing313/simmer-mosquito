import type { FeatureCollection, Geometry } from 'geojson';
import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl';
import type { Row } from '../data/collections';

export type OverlayOptions = {
	clustered: boolean;
	regionsVisible: boolean;
};

export type PointSet = { id: string; data: FeatureCollection };

export function featuresFrom(rows: Row[]): FeatureCollection {
	return {
		type: 'FeatureCollection',
		features: rows
			.filter((row) => row.geojson)
			.map((row) => ({
				type: 'Feature',
				id: undefined,
				geometry: row.geojson as Geometry,
				properties: { id: row.id },
			})),
	};
}

const POINT_LAYERS = {
	habitats: { color: '#2f7d4a', clusterColor: '#4a9a63' },
	addresses: { color: '#5b5f97', clusterColor: '#7a7eb8' },
} as const;

function removeIfPresent(map: MapLibreMap, ids: string[]) {
	for (const id of ids) {
		if (map.getLayer(id)) map.removeLayer(id);
	}
}

/** Habitats or Addresses as points, clustered or not. Re-adding is how clustering is switched. */
function addPointSet(
	map: MapLibreMap,
	name: keyof typeof POINT_LAYERS,
	data: FeatureCollection,
	clustered: boolean,
) {
	const { color, clusterColor } = POINT_LAYERS[name];
	const layerIds = [`${name}-clusters`, `${name}-count`, `${name}-points`];
	removeIfPresent(map, layerIds);
	if (map.getSource(name)) map.removeSource(name);
	map.addSource(name, {
		type: 'geojson',
		data,
		promoteId: 'id',
		cluster: clustered,
		clusterRadius: 50,
		clusterMaxZoom: 14,
	});
	if (clustered) {
		map.addLayer({
			id: `${name}-clusters`,
			type: 'circle',
			source: name,
			filter: ['has', 'point_count'],
			paint: {
				'circle-color': clusterColor,
				'circle-opacity': 0.85,
				'circle-radius': ['step', ['get', 'point_count'], 14, 50, 18, 250, 24],
				'circle-stroke-color': '#ffffff',
				'circle-stroke-width': 1.5,
			},
		});
		map.addLayer({
			id: `${name}-count`,
			type: 'symbol',
			source: name,
			filter: ['has', 'point_count'],
			layout: {
				'text-field': ['get', 'point_count_abbreviated'],
				'text-font': ['Noto Sans Medium'],
				'text-size': 12,
			},
			paint: { 'text-color': '#ffffff' },
		});
	}
	map.addLayer({
		id: `${name}-points`,
		type: 'circle',
		source: name,
		filter: clustered ? ['!', ['has', 'point_count']] : ['all'],
		paint: {
			'circle-color': color,
			'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 2.5, 16, 6],
			'circle-stroke-color': '#ffffff',
			'circle-stroke-width': 1,
		},
	});
}

export function setOverlays(
	map: MapLibreMap,
	data: { habitats: FeatureCollection; addresses: FeatureCollection; traps: FeatureCollection; regions: FeatureCollection },
	options: OverlayOptions,
) {
	if (!map.getSource('regions')) {
		map.addSource('regions', { type: 'geojson', data: data.regions });
		map.addLayer({
			id: 'regions-line',
			type: 'line',
			source: 'regions',
			paint: { 'line-color': '#b4562a', 'line-width': 1.2, 'line-opacity': 0.7 },
		});
	} else {
		(map.getSource('regions') as GeoJSONSource).setData(data.regions);
	}
	map.setLayoutProperty('regions-line', 'visibility', options.regionsVisible ? 'visible' : 'none');

	addPointSet(map, 'addresses', data.addresses, options.clustered);
	addPointSet(map, 'habitats', data.habitats, options.clustered);

	if (!map.getSource('traps')) {
		map.addSource('traps', { type: 'geojson', data: data.traps, promoteId: 'id' });
		map.addLayer({
			id: 'traps-points',
			type: 'circle',
			source: 'traps',
			paint: {
				'circle-color': '#c0392b',
				'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 3, 16, 7],
				'circle-stroke-color': '#ffffff',
				'circle-stroke-width': 1.5,
			},
		});
	} else {
		(map.getSource('traps') as GeoJSONSource).setData(data.traps);
	}
	ensureTopLayers(map);
}

/** The run's numbered pins and the Track draw above every record layer. */
export function ensureTopLayers(map: MapLibreMap) {
	if (!map.getSource('track')) {
		map.addSource('track', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
		map.addLayer({
			id: 'track-line',
			type: 'line',
			source: 'track',
			paint: { 'line-color': '#1d6fd8', 'line-width': 4 },
			layout: { 'line-cap': 'round', 'line-join': 'round' },
		});
	} else {
		map.moveLayer('track-line');
	}
	if (!map.getSource('route')) {
		map.addSource('route', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
		map.addLayer({
			id: 'route-pins',
			type: 'circle',
			source: 'route',
			paint: {
				'circle-radius': ['case', ['get', 'current'], 15, 11],
				'circle-color': [
					'case',
					['get', 'current'],
					'#e67e22',
					['get', 'visited'],
					'#8e9aa6',
					'#1f2d3d',
				],
				'circle-stroke-color': '#ffffff',
				'circle-stroke-width': 2,
			},
		});
		map.addLayer({
			id: 'route-numbers',
			type: 'symbol',
			source: 'route',
			layout: {
				'text-field': ['to-string', ['get', 'n']],
				'text-font': ['Noto Sans Medium'],
				'text-size': 12,
				'text-allow-overlap': true,
				'icon-allow-overlap': true,
			},
			paint: { 'text-color': '#ffffff' },
		});
	} else {
		map.moveLayer('route-pins');
		map.moveLayer('route-numbers');
	}
}
