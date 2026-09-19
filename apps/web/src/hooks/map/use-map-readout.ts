import type { Map as MapboxMap } from 'mapbox-gl';
import { useEffect, useState } from 'react';

/** How wide a stretch of the centre row to measure the ground distance across. */
const SAMPLE_PX = 100;

export interface ReadoutState {
	readonly lat: number;
	readonly lng: number;
	readonly zoom: number;
	/** Degrees clockwise from north, normalised to 0–359. */
	readonly bearing: number;
	readonly metersPerPixel: number;
}

/**
 * The camera as the readout draws it: centre, zoom, bearing and the ground
 * distance per pixel across the centre row, re-read on every `move`.
 */
export function useMapReadout(map: MapboxMap | null): ReadoutState | null {
	const [state, setState] = useState<ReadoutState | null>(null);

	useEffect(() => {
		if (map === null) {
			setState(null);
			return;
		}
		const sync = () => {
			const center = map.getCenter();
			// Measured off the map rather than derived from the zoom: unprojecting two
			// points on the centre row is the ground distance the reader is looking
			// at, whatever the latitude and whatever the camera is doing.
			const y = map.getContainer().clientHeight / 2;
			const left = map.unproject([0, y]);
			const right = map.unproject([SAMPLE_PX, y]);
			setState({
				lat: center.lat,
				lng: center.lng,
				zoom: map.getZoom(),
				bearing: (map.getBearing() + 360) % 360,
				metersPerPixel: left.distanceTo(right) / SAMPLE_PX,
			});
		};
		sync();
		map.on('move', sync);
		return () => {
			map.off('move', sync);
		};
	}, [map]);

	return state;
}
