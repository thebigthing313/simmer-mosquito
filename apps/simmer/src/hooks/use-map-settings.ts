import { useMapStore } from '@/src/stores/map-store';
import type { MapStyle, MapProjection, CursorStyle } from '@/src/stores/map-store';

/**
 * Hook for controlling map settings (style, projection, interactions, terrain).
 *
 * @example
 * ```tsx
 * const { style, setStyle, setTerrain3D } = useMapSettings();
 * setStyle('mapbox://styles/mapbox/satellite-streets-v12');
 * setTerrain3D(true);
 * ```
 */
export function useMapSettings() {
	const style = useMapStore((s) => s.style);
	const projection = useMapStore((s) => s.projection);
	const cursor = useMapStore((s) => s.cursor);
	const interactionsEnabled = useMapStore((s) => s.interactionsEnabled);
	const terrain3D = useMapStore((s) => s.terrain3D);

	const setStyle = useMapStore((s) => s.setStyle);
	const setProjection = useMapStore((s) => s.setProjection);
	const setCursor = useMapStore((s) => s.setCursor);
	const setInteractionsEnabled = useMapStore((s) => s.setInteractionsEnabled);
	const setTerrain3D = useMapStore((s) => s.setTerrain3D);

	return {
		style,
		projection,
		cursor,
		interactionsEnabled,
		terrain3D,
		setStyle: setStyle as (style: MapStyle) => void,
		setProjection: setProjection as (projection: MapProjection) => void,
		setCursor: setCursor as (cursor: CursorStyle) => void,
		setInteractionsEnabled,
		setTerrain3D,
	};
}
