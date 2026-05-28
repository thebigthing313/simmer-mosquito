import type { Map as MapboxMap } from 'mapbox-gl';
import { useGeoJsonSource } from '../hooks/use-geojson-source';
import { useVectorTileSource } from '../hooks/use-vector-tile-source';
import type { GeoJsonSourceDefinition, VectorTileSourceDefinition } from '../types';

export function GeoJsonSourceBinding({
	isLoaded,
	map,
	source,
	visible,
}: {
	readonly isLoaded: boolean;
	readonly map: MapboxMap | null;
	readonly source: GeoJsonSourceDefinition;
	readonly visible?: boolean;
}) {
	useGeoJsonSource(map, isLoaded, source, visible);
	return null;
}

export function VectorTileSourceBinding({
	isLoaded,
	map,
	source,
	visible,
}: {
	readonly isLoaded: boolean;
	readonly map: MapboxMap | null;
	readonly source: VectorTileSourceDefinition;
	readonly visible?: boolean;
}) {
	useVectorTileSource(map, isLoaded, source, visible);
	return null;
}
