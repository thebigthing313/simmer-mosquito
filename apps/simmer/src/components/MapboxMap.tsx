import mapboxgl from 'mapbox-gl';
import { memo, useEffect, useRef } from 'react';
import 'mapbox-gl/dist/mapbox-gl.css';
import { useMapLayerSync } from '@/src/hooks/use-map-layer-sync';
import { useUserLocation } from '@/src/hooks/use-user-location';
import { useMapStore } from '@/src/stores/map-store';
import {
	MapAttribution,
	MapControls,
	MapCoordinateDisplay,
	MapScaleBar,
	MapStyleSwitcher,
} from '@/src/components/map';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN;

/**
 * Persistent full-viewport Mapbox container.
 * Registers the map instance with the global Zustand store so every component
 * in the tree can control markers, polygons, viewport, etc.
 *
 * Memoized so it never re-renders when layouts toggle above it.
 */
function MapboxMapInner() {
	const containerRef = useRef<HTMLDivElement>(null);
	const mapRef = useRef<mapboxgl.Map | null>(null);

	const mapLoaded = useMapStore((s) => s.mapLoaded);
	const setMap = useMapStore((s) => s.setMap);
	const setMapLoaded = useMapStore((s) => s.setMapLoaded);
	const _syncViewport = useMapStore((s) => s._syncViewport);

	const { location } = useUserLocation();

	// Sync store markers / polygons / lines onto the live map
	useMapLayerSync();

	// Initialize map once
	useEffect(() => {
		if (!containerRef.current || mapRef.current) return;

		mapboxgl.accessToken = MAPBOX_TOKEN;

		const map = new mapboxgl.Map({
			container: containerRef.current,
			style: 'mapbox://styles/mapbox/dark-v11',
			center: [-95.7129, 37.0902],
			zoom: 4,
			attributionControl: false,
			logoPosition: 'bottom-right',
		});

		map.on('load', () => {
			setMapLoaded(true);
		});

		// Sync viewport state back to the store on every move
		map.on('moveend', () => {
			const center = map.getCenter();
			const bounds = map.getBounds();
			_syncViewport(
				{ lng: center.lng, lat: center.lat },
				map.getZoom(),
				map.getPitch(),
				map.getBearing(),
				bounds
					? {
							sw: { lng: bounds.getSouthWest().lng, lat: bounds.getSouthWest().lat },
							ne: { lng: bounds.getNorthEast().lng, lat: bounds.getNorthEast().lat },
						}
					: null,
			);
		});

		mapRef.current = map;
		setMap(map);

		return () => {
			map.remove();
			mapRef.current = null;
		};
	}, []);

	// Update map center when user location becomes available
	useEffect(() => {
		if (!mapRef.current || !mapLoaded || !location) return;

		mapRef.current.flyTo({
			center: [location.lng, location.lat],
			zoom: 12,
			duration: 2000,
		});
	}, [location, mapLoaded]);

	return (
		<div className="absolute inset-0 z-0">
			<div ref={containerRef} className="h-full w-full" />

			{/* Custom branded controls */}
			<MapControls />
			<MapStyleSwitcher />
			<MapScaleBar />
			<MapCoordinateDisplay />
			<MapAttribution />

			{!mapLoaded && (
				<div className="absolute inset-0 flex items-center justify-center bg-zinc-950">
					<div className="flex flex-col items-center gap-3">
						<div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-600 border-t-emerald-500" />
						<span className="text-xs text-zinc-500 uppercase tracking-widest">
							Loading Map
						</span>
					</div>
				</div>
			)}
		</div>
	);
}

export const MapboxMap = memo(MapboxMapInner);
