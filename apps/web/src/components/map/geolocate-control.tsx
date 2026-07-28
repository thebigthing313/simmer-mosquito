import { Loader2Icon, LocateFixedIcon } from '@simmer-mosquito/ui-web/icons/registry';
import type { Map as MapboxMap, Marker } from 'mapbox-gl';
import { useCallback, useEffect, useRef } from 'react';
import { MapControlButton, MapControlGroup } from './map-control';
import { loadMapboxGl } from './mapbox-gl-loader';
import { type GeolocationCoords, useGeolocation } from './use-geolocation';

/**
 * "Show your location" control. Requests the device position through
 * {@link useGeolocation}, flies the camera to it, and drops a pulsing marker so
 * the located point stays legible after the fly-to settles.
 */
export function GeolocateControl({ map }: { readonly map: MapboxMap | null }) {
	const markerRef = useRef<Marker | null>(null);

	const flyToCoords = useCallback(
		async (coords: GeolocationCoords) => {
			if (map === null) {
				return;
			}
			map.flyTo({
				center: [coords.longitude, coords.latitude],
				zoom: Math.max(map.getZoom(), 15),
				duration: 1100,
				essential: true,
			});

			// This control only renders alongside a live map, so the runtime is
			// already resolved and this awaits a settled promise rather than a fetch.
			const mapboxgl = await loadMapboxGl();
			const marker = markerRef.current ?? new mapboxgl.Marker({ element: createLocationDot() });
			markerRef.current = marker;
			marker.setLngLat([coords.longitude, coords.latitude]).addTo(map);
		},
		[map],
	);

	const { status, locate } = useGeolocation(flyToCoords);

	// Remove the marker when the control (or its map) goes away.
	useEffect(() => {
		return () => {
			markerRef.current?.remove();
			markerRef.current = null;
		};
	}, []);

	const isLocating = status === 'locating';
	const label =
		status === 'denied'
			? 'Location permission denied'
			: status === 'unavailable'
				? 'Location unavailable'
				: isLocating
					? 'Finding your location…'
					: 'Show your location';

	return (
		<MapControlGroup>
			<MapControlButton
				active={status === 'success'}
				disabled={map === null || isLocating || status === 'unavailable'}
				label={label}
				onClick={locate}
			>
				{isLocating ? <Loader2Icon className="animate-spin" /> : <LocateFixedIcon />}
			</MapControlButton>
		</MapControlGroup>
	);
}

/**
 * Build the user-location marker element. Tailwind utilities are read from this
 * literal by the content scanner, so the dot stays on the design system (brand
 * green core, soft halo) without any bespoke CSS.
 */
function createLocationDot(): HTMLDivElement {
	const element = document.createElement('div');
	element.className = 'relative grid size-5 place-items-center';
	element.innerHTML = `
		<span class="absolute inline-flex size-5 rounded-full bg-primary/25 motion-safe:animate-ping"></span>
		<span class="relative inline-flex size-3 rounded-full border-2 border-background bg-primary shadow"></span>
	`;
	return element;
}
