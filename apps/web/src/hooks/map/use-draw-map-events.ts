import type { Map as MapboxMap, MapMouseEvent } from 'mapbox-gl';
import { useEffect, useRef } from 'react';
import type { DrawEvent, DrawState } from '../../components/map/draw-machine';
import type { Mode } from '../../components/map/draw-parts';
import { isAimedAtMap } from '../../components/map/map-keys';
import { isMapLive } from './use-mapbox-map';

/**
 * Map and keyboard wiring for a draw, live while `mode` is anything but idle. It
 * turns clicks, moves, double-clicks, Enter and Escape into draw events and
 * hands them to `dispatch`. The cursor and the double-click zoom it takes over
 * are handed back on every exit.
 */
export function useDrawMapEvents({
	map,
	isLoaded,
	mode,
	dispatch,
}: {
	readonly map: MapboxMap | null;
	readonly isLoaded: boolean;
	readonly mode: Mode;
	readonly dispatch: (event: DrawEvent) => DrawState;
}): void {
	// Whether this draft has already been handed the canvas. The effect re-runs
	// on every mode change and an edit changes mode on every drag, so focusing on
	// each run would take focus back off a field the user had moved to mid-draw.
	const tookFocusRef = useRef(false);

	useEffect(() => {
		if (!isMapLive(map) || !isLoaded || mode.kind === 'idle') {
			tookFocusRef.current = false;
			return;
		}
		const activeMap = map;
		const canvas = activeMap.getCanvas();
		const previousCursor = canvas.style.cursor;
		canvas.style.cursor = 'crosshair';
		const doubleClickZoomWasEnabled = activeMap.doubleClickZoom.isEnabled();
		activeMap.doubleClickZoom.disable();
		// The key half of this hook only answers to keys the map surface got, so
		// the surface has to hold focus from the moment a draft opens rather than
		// from the first click on it. Every opener is a button somewhere else on
		// the page, and Escape is what the point prompt tells the user to press.
		// The canvas is mapbox's own focus target: `tabindex="0"`, `role="region"`
		// and an aria-label, and the element its arrow-key panning already needs
		// focused.
		if (!tookFocusRef.current) {
			tookFocusRef.current = true;
			canvas.focus({ preventScroll: true });
		}

		function handleClick(event: MapMouseEvent) {
			dispatch({ type: 'click', position: [event.lngLat.lng, event.lngLat.lat] });
		}

		function handleMove(event: MapMouseEvent) {
			const state = dispatch({ type: 'move', position: [event.lngLat.lng, event.lngLat.lat] });
			// An edit owns the cursor: {@link useDrawEditEvents} says whether a vertex
			// is under the pointer, and this would paint over the answer. Both
			// handlers are live at once and which runs last follows whichever effect
			// re-registered most recently, so the answer cannot be left to order.
			if (state.mode.kind !== 'edit') {
				canvas.style.cursor = 'crosshair';
			}
		}

		// The double-click zoom is off for as long as this listener is live, so
		// claiming the gesture costs nothing when the machine has no use for it.
		function handleDoubleClick(event: MapMouseEvent) {
			event.preventDefault();
			dispatch({ type: 'doubleClick' });
		}

		// The location panel sits beside the map and its controls stay live while a
		// draft is open, so an Enter meant for a description must not finish the
		// shape and an Escape meant to close a dropdown must not throw the draft
		// away. Enter is the Finish control and Escape the Cancel control, for
		// every mode this listener is registered for.
		function handleKeyDown(event: KeyboardEvent) {
			if (
				(event.key !== 'Enter' && event.key !== 'Escape') ||
				!isAimedAtMap(activeMap, event.target)
			) {
				return;
			}
			dispatch({ type: event.key === 'Enter' ? 'finish' : 'cancel' });
		}

		activeMap.on('click', handleClick);
		activeMap.on('mousemove', handleMove);
		activeMap.on('dblclick', handleDoubleClick);
		window.addEventListener('keydown', handleKeyDown);

		return () => {
			activeMap.off('click', handleClick);
			activeMap.off('mousemove', handleMove);
			activeMap.off('dblclick', handleDoubleClick);
			window.removeEventListener('keydown', handleKeyDown);
			try {
				canvas.style.cursor = previousCursor;
				if (doubleClickZoomWasEnabled) {
					activeMap.doubleClickZoom.enable();
				}
			} catch {
				// Map already torn down.
			}
		};
	}, [map, isLoaded, mode, dispatch]);
}
