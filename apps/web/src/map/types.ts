import type {
	GeoJSONFeature,
	LayerSpecification,
	LngLatLike,
	Map as MapboxMap,
	MapMouseEvent,
	MapOptions,
	PointLike,
	RequestParameters,
	StyleSpecification,
} from 'mapbox-gl';

export type MapCamera = {
	readonly center: LngLatLike;
	readonly zoom: number;
	readonly bearing?: number;
	readonly pitch?: number;
};

export type GeoJsonData = GeoJSON.GeoJSON;

export type MapFeatureProperties = Record<string, unknown>;

export interface MapFeatureClick {
	readonly id: string | number | undefined;
	readonly source: string;
	readonly sourceLayer: string | undefined;
	readonly layerId: string;
	readonly geometryType: string;
	readonly properties: MapFeatureProperties;
	readonly rawFeature: GeoJSONFeature;
}

export interface MapFeatureClickEvent {
	readonly point: PointLike;
	readonly lngLat: readonly [number, number];
	readonly features: readonly MapFeatureClick[];
	readonly originalEvent: MapMouseEvent;
}

export interface GeoJsonSourceDefinition {
	readonly id: string;
	readonly data: GeoJsonData;
	readonly layers: readonly LayerSpecification[];
	readonly generateId?: boolean;
	readonly promoteId?: string;
}

export interface VectorTileSourceDefinition {
	readonly id: string;
	readonly tiles: readonly string[];
	readonly layers: readonly LayerSpecification[];
	readonly minzoom?: number;
	readonly maxzoom?: number;
	readonly promoteId?: string;
}

export interface MapOverlayDefinition {
	readonly id: string;
	readonly label: string;
	readonly description?: string;
	readonly source: VectorTileSourceDefinition;
	readonly defaultVisible?: boolean;
}

export type MapOverlayVisibility = Readonly<Record<string, boolean>>;

export interface MapViewProps {
	readonly camera?: MapCamera;
	readonly className?: string;
	readonly geoJsonSources?: readonly GeoJsonSourceDefinition[];
	readonly interactive?: boolean;
	readonly mapStyle?: MapStyle;
	readonly onFeatureClick?: (event: MapFeatureClickEvent) => void;
	readonly onMapReady?: (map: MapboxMap) => void;
	readonly overlays?: readonly MapOverlayDefinition[];
	readonly reuseKey?: string;
	readonly transformRequest?: (url: string, resourceType?: string) => RequestParameters;
	readonly vectorTileSources?: readonly VectorTileSourceDefinition[];
}

export type MapInstanceOptions = Omit<MapOptions, 'container' | 'style'>;

export type MapStyle = StyleSpecification | string;
