import mapboxgl, { type ErrorEvent, type Map as MapboxMap } from 'mapbox-gl';
import { useEffect, useRef, useState } from 'react';
import {
	type BasemapId,
	basemapStyle,
	DEFAULT_MAP_CAMERA,
	getMapboxToken,
	type MapCamera,
} from './map-styles';

export interface UseMapboxMapOptions {
	/** The element the GL canvas mounts into. The map is created once it exists. */
	readonly container: HTMLDivElement | null;
	/** Active basemap. Changing it restyles the live map without recreating it. */
	readonly basemapId: BasemapId;
	/** Initial camera; only read when the map is first created. */
	readonly camera?: MapCamera;
}

export interface UseMapboxMapResult {
	readonly map: MapboxMap | null;
	readonly isLoaded: boolean;
	readonly hasToken: boolean;
	readonly error: string | null;
}

/**
 * Owns the Mapbox GL instance lifecycle for a single map surface: creation,
 * load/error state, container resize, and live basemap switching. Keeping all of
 * this behind one small interface means callers compose controls without
 * touching the imperative GL API.
 */
export function useMapboxMap({
	container,
	basemapId,
	camera,
}: UseMapboxMapOptions): UseMapboxMapResult {
	const [map, setMap] = useState<MapboxMap | null>(null);
	const [isLoaded, setIsLoaded] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const token = getMapboxToken().trim();
	const hasToken = token.length > 0;

	// Initial camera / basemap are read from refs so the create effect only
	// re-runs when the container or token changes — never on a basemap toggle.
	const cameraRef = useRef(camera);
	cameraRef.current = camera;
	const basemapRef = useRef(basemapId);
	basemapRef.current = basemapId;
	const appliedBasemap = useRef<BasemapId | null>(null);

	useEffect(() => {
		if (container === null || !hasToken) {
			return;
		}

		const initialCamera = cameraRef.current ?? DEFAULT_MAP_CAMERA;
		mapboxgl.accessToken = token;
		const instance = new mapboxgl.Map({
			container,
			style: basemapStyle(basemapRef.current).styleUrl,
			center: initialCamera.center,
			zoom: initialCamera.zoom,
			bearing: initialCamera.bearing ?? 0,
			pitch: initialCamera.pitch ?? 0,
			// We render attribution ourselves (bottom-left, compact) so the
			// bottom-right corner is free for the zoom + locate controls.
			attributionControl: false,
		});
		instance.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-left');
		appliedBasemap.current = basemapRef.current;

		let loaded = false;
		function handleLoad() {
			loaded = true;
			// Size to the now-final container before the first paint of tiles.
			instance.resize();
			setIsLoaded(true);
			setError(null);
		}
		function handleError(event: ErrorEvent) {
			// Transient tile/source errors are common once interactive; only a
			// failure before first load is worth surfacing as a hard error.
			if (loaded) {
				return;
			}
			setError(event.error?.message ?? 'The map failed to load.');
		}

		instance.on('load', handleLoad);
		instance.on('error', handleError);
		setMap(instance);

		return () => {
			instance.off('load', handleLoad);
			instance.off('error', handleError);
			instance.remove();
			setMap(null);
			setIsLoaded(false);
			setError(null);
		};
	}, [container, hasToken, token]);

	// Keep the GL canvas matched to its container. Runs as its own effect keyed on
	// the live map so it re-syncs every time the map is (re)created — including
	// React StrictMode's mount/unmount cycle, where a one-shot observer inside the
	// create effect would miss the final layout and leave a zero-sized canvas.
	useEffect(() => {
		if (map === null || container === null) {
			return;
		}
		const resize = () => map.resize();
		const frames = [
			requestAnimationFrame(resize),
			requestAnimationFrame(() => requestAnimationFrame(resize)),
		];
		const observer = new ResizeObserver(resize);
		observer.observe(container);
		return () => {
			for (const frame of frames) {
				cancelAnimationFrame(frame);
			}
			observer.disconnect();
		};
	}, [map, container]);

	// Restyle in place when the basemap changes. setStyle preserves the camera.
	useEffect(() => {
		if (map === null || appliedBasemap.current === basemapId) {
			return;
		}
		map.setStyle(basemapStyle(basemapId).styleUrl);
		appliedBasemap.current = basemapId;
	}, [map, basemapId]);

	return { map, isLoaded, hasToken, error };
}
