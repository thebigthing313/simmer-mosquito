import mapboxgl, {
	type ErrorEvent,
	type Map as MapboxMap,
	type RequestParameters,
} from 'mapbox-gl';
import { useEffect, useMemo, useRef, useState } from 'react';
import { getServerUrl } from '../../auth';
import { defaultMapCamera, emptyMapStyle, mapboxHabitatStyle } from '../styles';
import type { MapCamera, MapInstanceOptions, MapStyle } from '../types';

export interface UseMapInstanceOptions {
	readonly camera?: MapCamera;
	readonly container: HTMLDivElement | null;
	readonly interactive?: boolean;
	readonly mapOptions?: MapInstanceOptions;
	readonly mapStyle?: MapStyle;
	readonly nonFatalSourceIds?: readonly string[];
	readonly onError?: (error: Error) => void;
	readonly onMapReady?: (map: MapboxMap) => void;
	readonly reuseKey?: string;
	readonly transformRequest?: (url: string, resourceType?: string) => RequestParameters;
}

export interface UseMapInstanceResult {
	readonly error: Error | null;
	readonly isLoaded: boolean;
	readonly map: MapboxMap | null;
}

interface ReusableMapEntry {
	readonly container: HTMLDivElement;
	readonly map: MapboxMap;
	isLoaded: boolean;
}

const reusableMaps = new Map<string, ReusableMapEntry>();

export function useMapInstance(options: UseMapInstanceOptions): UseMapInstanceResult {
	const [map, setMap] = useState<MapboxMap | null>(null);
	const [isLoaded, setIsLoaded] = useState(false);
	const [error, setError] = useState<Error | null>(null);
	const isLoadedRef = useRef(false);
	const transformRequest = useMemo(
		() => options.transformRequest ?? createAuthenticatedTileRequestTransform(getServerUrl()),
		[options.transformRequest],
	);
	const nonFatalSourceIds = useRef(new Set<string>());

	useEffect(() => {
		nonFatalSourceIds.current = new Set(options.nonFatalSourceIds ?? []);
	}, [options.nonFatalSourceIds]);

	useEffect(() => {
		if (options.container === null) {
			return;
		}

		const camera = options.camera ?? defaultMapCamera;
		const accessToken = getMapboxAccessToken();
		mapboxgl.accessToken = accessToken;
		const reusableEntry =
			options.reuseKey === undefined ? undefined : reusableMaps.get(options.reuseKey);
		const mapContainer = reusableEntry?.container ?? createMapContainer();
		const mapInstance =
			reusableEntry?.map ??
			new mapboxgl.Map({
				container: mapContainer,
				style: options.mapStyle ?? getDefaultMapStyle(accessToken),
				center: camera.center,
				zoom: camera.zoom,
				bearing: camera.bearing ?? 0,
				pitch: camera.pitch ?? 0,
				interactive: options.interactive ?? true,
				transformRequest,
				...options.mapOptions,
			});

		options.container.appendChild(mapContainer);

		function handleLoad() {
			isLoadedRef.current = true;
			if (options.reuseKey !== undefined) {
				const entry = reusableMaps.get(options.reuseKey);
				if (entry !== undefined) {
					entry.isLoaded = true;
				}
			}
			setError(null);
			setIsLoaded(true);
			options.onMapReady?.(mapInstance);
		}

		function handleError(event: ErrorEvent) {
			const nextError = new Error(event.error.message);
			if (isLoadedRef.current || isNonFatalSourceError(event, nonFatalSourceIds.current)) {
				options.onError?.(nextError);
				return;
			}
			setError(nextError);
			options.onError?.(nextError);
		}

		mapInstance.on('load', handleLoad);
		mapInstance.on('error', handleError);
		if (options.reuseKey !== undefined && reusableEntry === undefined) {
			reusableMaps.set(options.reuseKey, {
				container: mapContainer,
				isLoaded: false,
				map: mapInstance,
			});
		}
		setMap(mapInstance);
		if (reusableEntry?.isLoaded === true || mapInstance.loaded()) {
			isLoadedRef.current = true;
			setError(null);
			setIsLoaded(true);
			options.onMapReady?.(mapInstance);
			queueMicrotask(() => mapInstance.resize());
		}

		return () => {
			mapInstance.off('load', handleLoad);
			mapInstance.off('error', handleError);
			if (options.reuseKey === undefined) {
				mapInstance.remove();
			} else {
				mapContainer.remove();
			}
			setMap(null);
			setIsLoaded(false);
			isLoadedRef.current = false;
		};
	}, [
		options.camera,
		options.container,
		options.interactive,
		options.mapOptions,
		options.mapStyle,
		options.onError,
		options.onMapReady,
		options.reuseKey,
		transformRequest,
	]);

	return { error, isLoaded, map };
}

export function createAuthenticatedTileRequestTransform(serverUrl: string) {
	return (url: string): RequestParameters => {
		if (url.startsWith(`${serverUrl}/map/tiles/`)) {
			return {
				url,
				credentials: 'include',
			};
		}

		return { url };
	};
}

export function getMapboxAccessToken(): string {
	return import.meta.env.VITE_MAPBOX_ACCESS_TOKEN ?? '';
}

function getDefaultMapStyle(accessToken: string): MapStyle {
	return accessToken.trim().length > 0 ? mapboxHabitatStyle : emptyMapStyle;
}

function createMapContainer(): HTMLDivElement {
	const container = document.createElement('div');
	container.style.position = 'absolute';
	container.style.inset = '0';
	container.style.height = '100%';
	container.style.width = '100%';
	return container;
}

function isNonFatalSourceError(event: ErrorEvent, sourceIds: ReadonlySet<string>): boolean {
	if (event.error.message.includes('/map/tiles/')) {
		return true;
	}

	const sourceId = readErrorSourceId(event);
	return sourceId !== null && sourceIds.has(sourceId);
}

function readErrorSourceId(event: ErrorEvent): string | null {
	const candidate = event as ErrorEvent & {
		readonly sourceId?: unknown;
		readonly source?: {
			readonly id?: unknown;
		};
	};

	if (typeof candidate.sourceId === 'string') {
		return candidate.sourceId;
	}

	if (typeof candidate.source?.id === 'string') {
		return candidate.source.id;
	}

	return null;
}
