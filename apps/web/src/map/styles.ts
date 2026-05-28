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

const mapColors = {
	activeHabitat: '#0c5331',
	blue: '#2d46b6',
	inactiveHabitat: '#708587',
	inaccessibleHabitat: '#ef2352',
	mapBackground: '#e8efeb',
	pointStroke: '#f9fdfb',
	warningFill: '#ebc751',
	warningStroke: '#7b461e',
} as const;

export const emptyMapStyle: StyleSpecification = {
	version: 8,
	name: 'SIMMER empty map',
	sources: {},
	layers: [
		{
			id: 'background',
			type: 'background',
			paint: {
				'background-color': mapColors.mapBackground,
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
					mapColors.inaccessibleHabitat,
					['boolean', ['get', 'isActive'], true],
					mapColors.activeHabitat,
					mapColors.inactiveHabitat,
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
				'line-color': mapColors.activeHabitat,
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
				'line-color': mapColors.blue,
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
					mapColors.inaccessibleHabitat,
					['boolean', ['get', 'isActive'], true],
					mapColors.activeHabitat,
					mapColors.inactiveHabitat,
				],
				'circle-opacity': 0.92,
				'circle-radius': ['interpolate', ['linear'], ['zoom'], 9, 3, 16, 6],
				'circle-stroke-color': mapColors.pointStroke,
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
				'fill-color': mapColors.warningFill,
				'fill-opacity': 0.3,
			},
		},
		{
			id: `${sourceId}-polygon-outline`,
			type: 'line',
			source: sourceId,
			filter: ['==', ['geometry-type'], 'Polygon'],
			paint: {
				'line-color': mapColors.warningStroke,
				'line-width': 2,
			},
		},
		{
			id: `${sourceId}-lines`,
			type: 'line',
			source: sourceId,
			filter: ['==', ['geometry-type'], 'LineString'],
			paint: {
				'line-color': mapColors.activeHabitat,
				'line-width': 3,
			},
		},
		{
			id: `${sourceId}-points`,
			type: 'circle',
			source: sourceId,
			filter: ['==', ['geometry-type'], 'Point'],
			paint: {
				'circle-color': mapColors.activeHabitat,
				'circle-radius': 5,
				'circle-stroke-color': mapColors.pointStroke,
				'circle-stroke-width': 1.5,
			},
		},
	];
}
