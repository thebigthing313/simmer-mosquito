import type { Map as MapboxMap } from 'mapbox-gl';
import { useEffect, useRef } from 'react';
import { insetPadding, type MapInset, NO_MAP_INSET } from '../../components/map/map-inset';
import { isMapLive } from './use-mapbox-map';

/** Long enough to read as the map making room, short enough not to feel like travel. */
const PADDING_DURATION_MS = 300;

/**
 * Keeps the map's viewport padding in step with the chrome floating over it.
 * The canvas owns the padding; every other camera call inherits it and passes
 * none of its own, except `useMapExtentFit`, which adds its fit margin on top.
 */
export function useMapPadding(map: MapboxMap | null, isLoaded: boolean, inset: MapInset): void {
	// The padding object is rebuilt every render, so the effect takes its four
	// numbers and builds the object itself; nothing it reads is a fresh identity.
	const { top, right, bottom, left } = insetPadding(0, inset);
	const appliedKeyRef = useRef<string | null>(null);
	const appliedMapRef = useRef<MapboxMap | null>(null);

	useEffect(() => {
		if (!isMapLive(map) || !isLoaded) {
			return;
		}
		const padding = { top, right, bottom, left };
		const key = paddingKey(padding);
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
	}, [map, isLoaded, top, right, bottom, left]);
}

function paddingKey(padding: MapInset): string {
	return `${padding.top}|${padding.right}|${padding.bottom}|${padding.left}`;
}

const EMPTY_KEY = paddingKey(NO_MAP_INSET);
