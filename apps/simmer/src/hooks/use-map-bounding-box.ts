import { useCallback, useMemo } from 'react';
import { useMapStore } from '@/src/stores/map-store';
import type { BoundingBox, LngLat } from '@/src/stores/map-store';

/**
 * Hook for reading and controlling the map bounding box.
 *
 * @example
 * ```tsx
 * const { bounds, fitBounds, getBoundsCenter } = useMapBoundingBox();
 * fitBounds({ sw: { lng: -74, lat: 40 }, ne: { lng: -73, lat: 41 } });
 * ```
 */
export function useMapBoundingBox() {
	const bounds = useMapStore((s) => s.bounds);
	const map = useMapStore((s) => s.map);
	const fitBounds = useMapStore((s) => s.fitBounds);

	/** Get the current bounding box directly from the map instance */
	const getCurrentBounds = useCallback((): BoundingBox | null => {
		if (!map) return null;
		const b = map.getBounds();
		if (!b) return null;
		return {
			sw: { lng: b.getSouthWest().lng, lat: b.getSouthWest().lat },
			ne: { lng: b.getNorthEast().lng, lat: b.getNorthEast().lat },
		};
	}, [map]);

	/** Compute the center of the current bounds */
	const boundsCenter = useMemo((): LngLat | null => {
		if (!bounds) return null;
		return {
			lng: (bounds.sw.lng + bounds.ne.lng) / 2,
			lat: (bounds.sw.lat + bounds.ne.lat) / 2,
		};
	}, [bounds]);

	/** Check whether a point falls within the current bounds */
	const containsPoint = useCallback(
		(point: LngLat): boolean => {
			if (!bounds) return false;
			return (
				point.lng >= bounds.sw.lng &&
				point.lng <= bounds.ne.lng &&
				point.lat >= bounds.sw.lat &&
				point.lat <= bounds.ne.lat
			);
		},
		[bounds],
	);

	/** Approximate width / height in degrees */
	const dimensions = useMemo(() => {
		if (!bounds) return null;
		return {
			width: Math.abs(bounds.ne.lng - bounds.sw.lng),
			height: Math.abs(bounds.ne.lat - bounds.sw.lat),
		};
	}, [bounds]);

	return {
		bounds,
		boundsCenter,
		dimensions,
		fitBounds,
		getCurrentBounds,
		containsPoint,
	};
}
