import type { GeoJsonGeometry } from '@simmer-mosquito/mapping';
import type { Map as MapboxMap } from 'mapbox-gl';
import { useEffect, useRef } from 'react';
import { frameOnMap } from '../../components/map/map-camera';

/**
 * Frames `geometry` as a record (see `frameOnMap`) when the geometry itself
 * changes, and never while `isDrawing`.
 */
export function useFitToGeometry(
	map: MapboxMap | null,
	geometry: GeoJsonGeometry | null,
	isDrawing = false,
): void {
	const lastFitRef = useRef<string | null>(null);
	useEffect(() => {
		if (map === null || geometry === null || isDrawing) {
			return;
		}
		// Only refit when the geometry itself changes, not on every render, so the
		// user's manual pans aren't yanked back.
		const signature = JSON.stringify(geometry);
		if (lastFitRef.current === signature) {
			return;
		}
		lastFitRef.current = signature;
		frameOnMap(map, geometry, { purpose: 'record', animate: true });
	}, [map, geometry, isDrawing]);
}
