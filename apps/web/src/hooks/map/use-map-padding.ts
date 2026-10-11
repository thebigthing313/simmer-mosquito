import type { Map as MapboxMap } from 'mapbox-gl';
import { useEffect, useRef } from 'react';
import {
	insetPadding,
	type MapInset,
	NO_MAP_INSET,
	requestCanvasInset,
	strayedCanvasInset,
} from '../../components/map/map-inset';
import { isMapLive } from './use-mapbox-map';

/** Long enough to read as the map making room, short enough not to feel like travel. */
const PADDING_DURATION_MS = 300;

/**
 * Keeps the map's viewport padding in step with the chrome floating over it.
 * The canvas owns the padding and this is its only writer. It records the
 * inset it asked for on the map, which is the base `framingPadding` reads,
 * and asks again when a move ends with the map holding something else.
 * `focusOnMap` passes no padding and inherits it; `frameOnMap` adds its margin
 * through `framingPadding`, which passes `retainPadding: false` so the margin
 * is gone once the frame ends.
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
		requestCanvasInset(map, padding);
		// A map starts with no padding, so an opening frame that wants none has
		// nothing to say. Anything else moves, instantly on a fresh instance and
		// animated when a panel opens or closes under the reader.
		if (isFreshMap && key === EMPTY_KEY) {
			return;
		}
		map.easeTo({ padding, duration: isFreshMap ? 0 : PADDING_DURATION_MS });
	}, [map, isLoaded, top, right, bottom, left]);

	useEffect(() => {
		if (!isMapLive(map) || !isLoaded) {
			return;
		}
		let frame: number | null = null;
		const settle = () => {
			frame = null;
			if (!isMapLive(map) || map.isMoving()) {
				return;
			}
			const requested = strayedCanvasInset(map);
			if (requested === undefined) {
				return;
			}
			map.easeTo({ padding: { ...requested }, duration: PADDING_DURATION_MS });
		};
		// A frame later; `docs/web-hooks.md` says why.
		const onMoveEnd = () => {
			if (frame === null) {
				frame = requestAnimationFrame(settle);
			}
		};
		map.on('moveend', onMoveEnd);
		return () => {
			map.off('moveend', onMoveEnd);
			if (frame !== null) {
				cancelAnimationFrame(frame);
			}
		};
	}, [map, isLoaded]);
}

function paddingKey(padding: MapInset): string {
	return `${padding.top}|${padding.right}|${padding.bottom}|${padding.left}`;
}

const EMPTY_KEY = paddingKey(NO_MAP_INSET);
