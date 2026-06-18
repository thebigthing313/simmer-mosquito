import { CompassIcon, MinusIcon, PlusIcon } from '@simmer-mosquito/ui-web/icons/registry';
import type { Map as MapboxMap } from 'mapbox-gl';
import { useEffect, useState } from 'react';
import { MapControlButton, MapControlDivider, MapControlGroup } from './map-control';

/**
 * Zoom in / out plus a compass that resets bearing and pitch to north. The
 * compass needle tracks the live map rotation, so it doubles as an orientation
 * cue rather than a static button.
 */
export function MapZoomControls({ map }: { readonly map: MapboxMap | null }) {
	const bearing = useMapBearing(map);
	const disabled = map === null;

	return (
		<MapControlGroup>
			<MapControlButton disabled={disabled} label="Zoom in" onClick={() => map?.zoomIn()}>
				<PlusIcon />
			</MapControlButton>
			<MapControlDivider />
			<MapControlButton disabled={disabled} label="Zoom out" onClick={() => map?.zoomOut()}>
				<MinusIcon />
			</MapControlButton>
			<MapControlDivider />
			<MapControlButton
				disabled={disabled}
				label="Reset to north"
				onClick={() => map?.easeTo({ bearing: 0, pitch: 0, duration: 400 })}
			>
				<CompassIcon
					className="transition-transform"
					style={{ transform: `rotate(${-bearing}deg)` }}
				/>
			</MapControlButton>
		</MapControlGroup>
	);
}

/** Track the map's bearing so the compass needle stays oriented to true north. */
function useMapBearing(map: MapboxMap | null): number {
	const [bearing, setBearing] = useState(0);

	useEffect(() => {
		if (map === null) {
			return;
		}
		const sync = () => setBearing(map.getBearing());
		sync();
		map.on('rotate', sync);
		return () => {
			map.off('rotate', sync);
		};
	}, [map]);

	return bearing;
}
