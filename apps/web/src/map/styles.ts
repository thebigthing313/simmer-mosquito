import type { LayerSpecification, StyleSpecification } from 'mapbox-gl';
import { getServerUrl } from '../auth';
import type { GeoJsonSourceDefinition, VectorTileSourceDefinition } from './types';

export const defaultMapCamera = {
	center: [-95.7, 37.1] as [number, number],
	zoom: 3.5,
	bearing: 0,
	pitch: 0,
};

export const mapboxHabitatStyle = 'mapbox://styles/mapbox/streets-v12';

export const emptyMapStyle: StyleSpecification = {
	version: 8,
	name: 'SIMMER empty map',
	sources: {},
	layers: [
		{
			id: 'background',
			type: 'background',
			paint: {
				'background-color': 'oklch(94.5% 0.009 165)',
			},
		},
	],
};

export function createHabitatTileSource(
	options: {
		readonly filters?: HabitatTileFilters;
		readonly id?: string;
		readonly serverUrl?: string;
	} = {},
): VectorTileSourceDefinition {
	const id = options.id ?? 'habitats';
	const sourceLayer = 'habitats';

	return {
		id,
		tiles: [buildTileUrl(options.serverUrl ?? getServerUrl(), 'habitats', options.filters)],
		promoteId: 'id',
		layers: createHabitatTileLayers(id, sourceLayer),
	};
}

export function createGeoJsonMapSource(options: {
	readonly id: string;
	readonly data: GeoJSON.GeoJSON;
	readonly layers?: readonly LayerSpecification[];
}): GeoJsonSourceDefinition {
	return {
		id: options.id,
		data: options.data,
		layers: options.layers ?? createDefaultGeoJsonLayers(options.id),
	};
}

export interface HabitatTileFilters {
	readonly habitatTypeId?: readonly string[];
	readonly isActive?: boolean;
	readonly isInaccessible?: boolean;
}

function buildTileUrl(
	serverUrl: string,
	tileset: string,
	filters: HabitatTileFilters | undefined,
): string {
	const url = `${trimTrailingSlash(serverUrl)}/map/tiles/${tileset}/{z}/{x}/{y}.mvt`;
	const params = new URLSearchParams();

	if (filters?.isActive !== undefined) {
		params.set('isActive', String(filters.isActive));
	}
	if (filters?.isInaccessible !== undefined) {
		params.set('isInaccessible', String(filters.isInaccessible));
	}
	if (filters?.habitatTypeId !== undefined && filters.habitatTypeId.length > 0) {
		params.set('habitatTypeId', [...filters.habitatTypeId].sort().join(','));
	}

	const query = params.toString();
	return query.length === 0 ? url : `${url}?${query}`;
}

function trimTrailingSlash(value: string): string {
	return value.replace(/\/+$/, '');
}

function createHabitatTileLayers(
	sourceId: string,
	sourceLayer: string,
): readonly LayerSpecification[] {
	return [
		{
			id: `${sourceId}-polygon-fill`,
			type: 'fill',
			source: sourceId,
			'source-layer': sourceLayer,
			filter: ['==', ['geometry-type'], 'Polygon'],
			paint: {
				'fill-color': [
					'case',
					['boolean', ['get', 'isInaccessible'], false],
					'oklch(61.56% 0.2307 16.37)',
					['boolean', ['get', 'isActive'], true],
					'oklch(52.71% 0.1114 159.1429)',
					'oklch(60% 0.024 205)',
				],
				'fill-opacity': 0.22,
			},
		},
		{
			id: `${sourceId}-polygon-outline`,
			type: 'line',
			source: sourceId,
			'source-layer': sourceLayer,
			filter: ['==', ['geometry-type'], 'Polygon'],
			paint: {
				'line-color': 'oklch(39.15% 0.0882 156.38)',
				'line-opacity': 0.74,
				'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.8, 16, 2],
			},
		},
		{
			id: `${sourceId}-lines`,
			type: 'line',
			source: sourceId,
			'source-layer': sourceLayer,
			filter: ['==', ['geometry-type'], 'LineString'],
			paint: {
				'line-color': 'oklch(44.83% 0.1791 268.37)',
				'line-opacity': 0.78,
				'line-width': ['interpolate', ['linear'], ['zoom'], 10, 1.2, 16, 3],
			},
		},
		{
			id: `${sourceId}-points`,
			type: 'circle',
			source: sourceId,
			'source-layer': sourceLayer,
			filter: ['==', ['geometry-type'], 'Point'],
			paint: {
				'circle-color': [
					'case',
					['boolean', ['get', 'isInaccessible'], false],
					'oklch(61.56% 0.2307 16.37)',
					['boolean', ['get', 'isActive'], true],
					'oklch(39.15% 0.0882 156.38)',
					'oklch(60% 0.024 205)',
				],
				'circle-opacity': 0.92,
				'circle-radius': ['interpolate', ['linear'], ['zoom'], 9, 3, 16, 6],
				'circle-stroke-color': 'oklch(99% 0.004 165)',
				'circle-stroke-width': 1.2,
			},
		},
	];
}

function createDefaultGeoJsonLayers(sourceId: string): readonly LayerSpecification[] {
	return [
		{
			id: `${sourceId}-polygon-fill`,
			type: 'fill',
			source: sourceId,
			filter: ['==', ['geometry-type'], 'Polygon'],
			paint: {
				'fill-color': 'oklch(84% 0.14 92)',
				'fill-opacity': 0.3,
			},
		},
		{
			id: `${sourceId}-polygon-outline`,
			type: 'line',
			source: sourceId,
			filter: ['==', ['geometry-type'], 'Polygon'],
			paint: {
				'line-color': 'oklch(45% 0.09 55)',
				'line-width': 2,
			},
		},
		{
			id: `${sourceId}-lines`,
			type: 'line',
			source: sourceId,
			filter: ['==', ['geometry-type'], 'LineString'],
			paint: {
				'line-color': 'oklch(39.15% 0.0882 156.38)',
				'line-width': 3,
			},
		},
		{
			id: `${sourceId}-points`,
			type: 'circle',
			source: sourceId,
			filter: ['==', ['geometry-type'], 'Point'],
			paint: {
				'circle-color': 'oklch(39.15% 0.0882 156.38)',
				'circle-radius': 5,
				'circle-stroke-color': 'oklch(99% 0.004 165)',
				'circle-stroke-width': 1.5,
			},
		},
	];
}
