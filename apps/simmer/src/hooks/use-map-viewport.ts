import { useMapStore } from '@/src/stores/map-store';

/**
 * Hook for reading the current map viewport (zoom, pitch, bearing).
 *
 * @example
 * ```tsx
 * const { zoom, pitch, bearing, zoomTo, resetNorth } = useMapViewport();
 * zoomTo(15);
 * ```
 */
export function useMapViewport() {
	const zoom = useMapStore((s) => s.zoom);
	const pitch = useMapStore((s) => s.pitch);
	const bearing = useMapStore((s) => s.bearing);

	const zoomTo = useMapStore((s) => s.zoomTo);
	const setPitch = useMapStore((s) => s.setPitch);
	const setBearing = useMapStore((s) => s.setBearing);
	const resetNorth = useMapStore((s) => s.resetNorth);

	return {
		zoom,
		pitch,
		bearing,
		zoomTo,
		setPitch,
		setBearing,
		resetNorth,
	};
}
