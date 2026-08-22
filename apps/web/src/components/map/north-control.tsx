import { CompassIcon, NorthIcon } from '@simmer-mosquito/ui-web/icons/registry';
import type { Map as MapboxMap } from 'mapbox-gl';
import { useEffect, useState } from 'react';
import { MapControlButton, MapControlGroup } from './map-control';

/**
 * The north arrow, in a group of its own beside the zoom controls.
 *
 * The arrow points at north on screen, so it is a reading of the camera before
 * it is a button: a rotated map says so without the reader having to try
 * anything. Hovering or focusing swaps it for a compass, which is what pressing
 * it does: put the camera back to north and flat.
 */
export function NorthControl({ map }: { readonly map: MapboxMap | null }) {
	const bearing = useMapBearing(map);

	return (
		<MapControlGroup>
			<MapControlButton
				disabled={map === null}
				label="Reset to north"
				onClick={() => map?.easeTo({ bearing: 0, pitch: 0, duration: 400 })}
			>
				<span className="relative block size-4">
					<NorthIcon
						aria-hidden="true"
						className="absolute inset-0 size-4 transition-[opacity,transform] group-hover:opacity-0 group-focus-visible:opacity-0"
						// Negated: the arrow tracks where north went, not where the camera turned.
						style={{ transform: `rotate(${-bearing}deg)` }}
					/>
					<CompassIcon
						aria-hidden="true"
						className="absolute inset-0 size-4 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
					/>
				</span>
			</MapControlButton>
		</MapControlGroup>
	);
}

/**
 * Track the map's bearing so the arrow stays pointed at true north.
 *
 * On `move`, not `rotate`. Every camera change fires `move`, while `rotate`
 * fires only for the paths Mapbox counts as a rotation, so a bearing that
 * arrives through a fit or a jump can land without one and leave the arrow
 * describing a camera the map no longer has.
 */
function useMapBearing(map: MapboxMap | null): number {
	const [bearing, setBearing] = useState(0);

	useEffect(() => {
		if (map === null) {
			return;
		}
		const sync = () => setBearing(map.getBearing());
		sync();
		map.on('move', sync);
		return () => {
			map.off('move', sync);
		};
	}, [map]);

	return bearing;
}
