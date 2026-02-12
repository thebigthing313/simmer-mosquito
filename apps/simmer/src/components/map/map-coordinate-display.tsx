import { useMapCursorPosition } from '@/src/hooks/use-map-events';
import { useMapStore } from '@/src/stores/map-store';

/**
 * Displays live cursor coordinates and current zoom level
 * in a subtle on-brand bar at the bottom of the map.
 */
export function MapCoordinateDisplay() {
	const mapLoaded = useMapStore((s) => s.mapLoaded);
	const zoom = useMapStore((s) => s.zoom);
	const cursorPos = useMapCursorPosition();

	if (!mapLoaded) return null;

	return (
		<div className="absolute bottom-2 left-1/2 z-40 -translate-x-1/2">
			<div className="flex items-center gap-3 rounded-full border border-white/8 bg-zinc-900/50 px-3 py-1 font-mono text-[10px] tabular-nums text-white/40 backdrop-blur-xl">
				{cursorPos ? (
					<>
						<span>{cursorPos.lat.toFixed(5)}° N</span>
						<span className="text-white/15">|</span>
						<span>{cursorPos.lng.toFixed(5)}° W</span>
					</>
				) : (
					<span className="text-white/25">—</span>
				)}
				<span className="text-white/15">|</span>
				<span>z{zoom.toFixed(1)}</span>
			</div>
		</div>
	);
}
