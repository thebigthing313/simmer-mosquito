import type { ErrorEvent, Map as MapboxMap } from 'mapbox-gl';
import { useEffect, useRef, useState } from 'react';
import { getServerUrl } from '../../auth';
import {
	type BasemapId,
	basemapStyle,
	DEFAULT_MAP_CAMERA,
	getMapboxToken,
	type MapCamera,
} from './map-styles';
import { loadMapboxGl } from './mapbox-gl-loader';

// Our authenticated MVT tiles are served by the SIMMER control plane, which is a
// different origin from the web app in every environment where they don't share a
// host (e.g. local dev on :3002). Mapbox GL's tile worker fetches cross-origin
// requests with `same-origin` credentials by default, so the session cookie is
// dropped and every tile 401s. Opt credentials in — but only for our own server,
// never for Mapbox's own style/sprite/glyph/basemap-tile requests.
const serverOrigin = (() => {
	try {
		return new URL(getServerUrl()).origin;
	} catch {
		return null;
	}
})();

export interface UseMapboxMapOptions {
	/** The element the GL canvas mounts into. The map is created once it exists. */
	readonly container: HTMLDivElement | null;
	/** Active basemap. Changing it restyles the live map without recreating it. */
	readonly basemapId: BasemapId;
	/** Initial camera; only read when the map is first created. */
	readonly camera?: MapCamera;
	/** Whether to mount the compact attribution control. Defaults to true. */
	readonly attribution?: boolean;
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
	attribution,
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
	const attributionRef = useRef(attribution);
	attributionRef.current = attribution;
	const appliedBasemap = useRef<BasemapId | null>(null);

	useEffect(() => {
		if (container === null || !hasToken) {
			return;
		}

		// The GL runtime is fetched on demand (see `loadMapboxGl`), so creation is
		// async and the effect may be torn down mid-flight — React StrictMode does
		// exactly that on every mount. `disposed` covers the window before the
		// instance exists; `teardown` takes over once it does, so neither path can
		// leak a live map.
		let disposed = false;
		let teardown: (() => void) | null = null;

		void loadMapboxGl().then((mapboxgl) => {
			if (disposed) {
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
				// Start with no attribution; we add a compact one ourselves (when the
				// caller wants it) in the bottom-right corner so it tucks in beneath the
				// zoom + locate control stack.
				attributionControl: false,
				// Send the session cookie with tile requests to our own MVT server so the
				// authorized vector tiles load; leave every other request untouched.
				transformRequest: (url) =>
					serverOrigin !== null && url.startsWith(serverOrigin)
						? { url, credentials: 'include' }
						: { url },
			});
			if (attributionRef.current !== false) {
				instance.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-right');
			}
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

			teardown = () => {
				instance.off('load', handleLoad);
				instance.off('error', handleError);
				instance.remove();
				setMap(null);
				setIsLoaded(false);
				setError(null);
			};
		});

		return () => {
			disposed = true;
			teardown?.();
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
