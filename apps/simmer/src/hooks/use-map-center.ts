import { useCallback } from 'react';
import { useMapStore } from '@/src/stores/map-store';
import type { LngLat, FlyToOptions } from '@/src/stores/map-store';

/**
 * Hook for reading and controlling the map center.
 *
 * @example
 * ```tsx
 * const { center, setCenter, flyTo } = useMapCenter();
 * flyTo({ center: { lng: -73.935, lat: 40.730 }, zoom: 14 });
 * ```
 */
export function useMapCenter() {
	const center = useMapStore((s) => s.center);
	const setCenter = useMapStore((s) => s.setCenter);
	const flyTo = useMapStore((s) => s.flyTo);
	const easeTo = useMapStore((s) => s.easeTo);

	const flyToCenter = useCallback(
		(lngLat: LngLat, zoom?: number, duration?: number) => {
			flyTo({ center: lngLat, zoom, duration });
		},
		[flyTo],
	);

	return {
		center,
		setCenter,
		flyTo: flyTo as (opts: FlyToOptions) => void,
		flyToCenter,
		easeTo,
	};
}
