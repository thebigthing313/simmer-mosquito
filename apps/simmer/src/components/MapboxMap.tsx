import mapboxgl from 'mapbox-gl';
import { memo, useEffect, useRef, useState } from 'react';
import 'mapbox-gl/dist/mapbox-gl.css';
import { useUserLocation } from '@/src/hooks/use-user-location';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN;

/**
 * Persistent full-viewport Mapbox container.
 * Memoized so it never re-renders when layouts toggle above it.
 */
function MapboxMapInner() {
	const containerRef = useRef<HTMLDivElement>(null);
	const mapRef = useRef<mapboxgl.Map | null>(null);
	const [mapLoaded, setMapLoaded] = useState(false);
	const { location } = useUserLocation();

	// Initialize map once
	useEffect(() => {
		if (!containerRef.current || mapRef.current) return;

		mapboxgl.accessToken = MAPBOX_TOKEN;

		const map = new mapboxgl.Map({
			container: containerRef.current,
			// A dark, muted style that works well as a dashboard backdrop
			style: 'mapbox://styles/mapbox/dark-v11',
			center: [-95.7129, 37.0902], // Center of US
			zoom: 4,
			attributionControl: false,
			logoPosition: 'bottom-right',
		});

		map.addControl(new mapboxgl.NavigationControl(), 'bottom-right');
		map.addControl(
			new mapboxgl.AttributionControl({ compact: true }),
			'bottom-right',
		);

		map.on('load', () => {
			setMapLoaded(true);
		});

		mapRef.current = map;

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
