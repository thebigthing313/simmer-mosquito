import type { Map as MapboxMap } from 'mapbox-gl';
import { useEffect, useRef } from 'react';
import { insetPadding, type MapInset, NO_MAP_INSET } from './map-inset';
import { isMapLive } from './use-mapbox-map';

/** Long enough to read as the map making room, short enough not to feel like travel. */
const PADDING_DURATION_MS = 300;

/**
 * Keep the map's viewport padding in step with what is floating over it.
 *
 * Mapbox padding is map state, not an argument to one camera call: `setPadding`
 * is documented as equivalent to `jumpTo({padding})`, and a `padding` passed to
 * `flyTo` stays on the map afterwards. So padding cannot be applied by whichever
 * camera call happens to run next. Do that and a page that flies to a record,
 * drops the selection, then collapses its panel leaves the map framed around a
 * panel that is no longer there, and every later zoom or locate is off by half
 * the panel's width.
 *
 * One writer instead: the canvas knows what is over it, so the canvas owns the
 * padding. Every other camera call then inherits it and passes none of its own,
 * except {@link useMapExtentFit}, which adds its fit margin on top.
 */
export function useMapPadding(map: MapboxMap | null, isLoaded: boolean, inset: MapInset): void {
	const padding = insetPadding(0, inset);
	const key = `${padding.top}|${padding.right}|${padding.bottom}|${padding.left}`;
	const appliedKeyRef = useRef<string | null>(null);
	const appliedMapRef = useRef<MapboxMap | null>(null);

	// biome-ignore lint/correctness/useExhaustiveDependencies: padding keyed by value.
	useEffect(() => {
		if (!isMapLive(map) || !isLoaded) {
			return;
		}
		const isFreshMap = appliedMapRef.current !== map;
		if (!isFreshMap && appliedKeyRef.current === key) {
			return;
		}
		appliedMapRef.current = map;
		appliedKeyRef.current = key;
		// A map starts with no padding, so an opening frame that wants none has
		// nothing to say. Anything else moves, instantly on a fresh instance and
		// animated when a panel opens or closes under the reader.
		if (isFreshMap && key === EMPTY_KEY) {
			return;
		}
		map.easeTo({ padding, duration: isFreshMap ? 0 : PADDING_DURATION_MS });
	}, [map, isLoaded, key]);
}

const EMPTY_KEY = `${NO_MAP_INSET.top}|${NO_MAP_INSET.right}|${NO_MAP_INSET.bottom}|${NO_MAP_INSET.left}`;
