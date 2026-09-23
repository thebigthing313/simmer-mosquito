import type { Map as MapboxMap } from 'mapbox-gl';
import { useEffect, useState } from 'react';

/** The map's bearing in degrees, re-read on every `move`. */
export function useMapBearing(map: MapboxMap | null): number {
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
