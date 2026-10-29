import type { LngLat } from '@simmer-mosquito/mapping';
import type { Map as MapboxMap, Marker } from 'mapbox-gl';
import { useEffect, useRef } from 'react';
import { createLandingPinElement } from '../../components/map/landing-pin';
import { loadMapboxGl } from '../../components/map/mapbox-gl-loader';

/** The one temporary pin a map holds where the camera was sent. */
export interface LandingPin {
	/** Put the pin at `point`, named `name`, replacing any pin already down. */
	readonly drop: (point: LngLat, name: string) => void;
	/** Take the pin off the map. */
	readonly clear: () => void;
}

/**
 * A temporary marker on `map` where a place search or Go to coordinates
 * landed. The map holds at most one: each `drop` replaces the last, and the
 * pin goes when `clear` is called, when the map changes and on unmount.
 */
export function useLandingPin(map: MapboxMap | null): LandingPin {
	const markerRef = useRef<Marker | null>(null);
	// Bumped by every drop and clear, so a drop whose runtime load resolves after
	// a later drop or clear adds nothing.
	const generationRef = useRef(0);

	const clear = () => {
		generationRef.current += 1;
		markerRef.current?.remove();
		markerRef.current = null;
	};

	const drop = (point: LngLat, name: string) => {
		clear();
		if (map === null) {
			return;
		}
		const generation = generationRef.current;
		// The pin is only dropped beside a live map, so the runtime has already
		// loaded and this awaits a settled promise rather than a fetch.
		void loadMapboxGl().then((mapboxgl) => {
			if (generationRef.current !== generation) {
				return;
			}
			markerRef.current = new mapboxgl.Marker({
				element: createLandingPinElement(name),
				anchor: 'bottom',
			})
				.setLngLat([point.lng, point.lat])
				.addTo(map);
		});
	};

	// A null map holds no pin, since `drop` puts none down without one. Moving
	// off a live map, or unmounting, runs this cleanup and takes its pin away.
	useEffect(() => {
		if (map === null) {
			return;
		}
		const generation = generationRef;
		const marker = markerRef;
		return () => {
			generation.current += 1;
			marker.current?.remove();
			marker.current = null;
		};
	}, [map]);

	return { drop, clear };
}
