import type { PlanarPosition } from '@simmer-mosquito/mapping';
import type { Map as MapboxMap, MapMouseEvent } from 'mapbox-gl';
import { useEffect, useRef } from 'react';
import {
	type DrawDrag,
	type DrawPartGeometry,
	type DrawTarget,
	isRubberBanding,
	type Mode,
} from '../../components/map/draw-parts';
import { isAimedAtMap } from '../../components/map/map-keys';
import { isMapLive } from './use-mapbox-map';

/**
 * Map and keyboard wiring for a draw, live only while a mode needs it. The
 * cursor and the double-click zoom it takes over are handed back on every exit.
 */
export function useDrawMapEvents({
	map,
	isLoaded,
	mode,
	modeRef,
	cursorRef,
	dragRef,
	repaint,
	applyParts,
	finishRef,
	setMode,
	setVertices,
}: {
	readonly map: MapboxMap | null;
	readonly isLoaded: boolean;
	readonly mode: Mode;
	readonly modeRef: { current: Mode };
	readonly cursorRef: { current: PlanarPosition | null };
	readonly dragRef: { current: DrawDrag | null };
	readonly repaint: () => void;
	readonly applyParts: (target: DrawTarget, parts: readonly DrawPartGeometry[]) => void;
	readonly finishRef: { current: () => void };
	readonly setMode: (next: Mode) => void;
	readonly setVertices: (
		next:
			| readonly PlanarPosition[]
			| ((previous: readonly PlanarPosition[]) => readonly PlanarPosition[]),
	) => void;
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
			const current = modeRef.current;
			const position: PlanarPosition = [event.lngLat.lng, event.lngLat.lat];
			if (current.kind === 'point') {
				current.resolve({ type: 'Point', coordinates: position });
				setMode({ kind: 'idle' });
				return;
			}
			if (current.kind !== 'draw') {
				return;
			}
			// A point piece finishes on its first click, the way a first point does.
			if (current.type === 'Point') {
				applyParts(current.target, [{ type: 'Point', coordinates: position }]);
				return;
			}
			setVertices((previous) => [...previous, position]);
		}

		function handleMove(event: MapMouseEvent) {
			// An edit owns the cursor: {@link useDrawEditEvents} says whether a vertex
			// is under the pointer, and this would paint over the answer. Both
			// handlers are live at once and which runs last follows whichever effect
			// re-registered most recently, so the answer cannot be left to order.
			if (modeRef.current.kind === 'edit') {
				return;
			}
			canvas.style.cursor = 'crosshair';
			if (isRubberBanding(modeRef.current)) {
				cursorRef.current = [event.lngLat.lng, event.lngLat.lat];
				repaint();
			}
		}

		function handleDoubleClick(event: MapMouseEvent) {
			if (isRubberBanding(modeRef.current)) {
				event.preventDefault();
				finishRef.current();
			}
		}

		// The location panel sits beside the map and its controls stay live while a
		// draft is open, so an Enter meant for a description must not finish the
		// shape and an Escape meant to close a dropdown must not throw the draft
		// away. Both arms cover every mode this listener is registered for,
		// because a draw, a hole, a continuation, an edit and an open sketch all
		// reach Finish through the same `finishRef` and all cancel through the one
		// Escape arm.
		function handleKeyDown(event: KeyboardEvent) {
			if (
				(event.key !== 'Enter' && event.key !== 'Escape') ||
				!isAimedAtMap(activeMap, event.target)
			) {
				return;
			}
			if (event.key === 'Enter') {
				finishRef.current();
				return;
			}
			const current = modeRef.current;
			if (current.kind === 'point') {
				current.reject(new Error('Point selection cancelled.'));
			}
			cursorRef.current = null;
			dragRef.current = null;
			setVertices([]);
			setMode({ kind: 'idle' });
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
	}, [
		map,
		isLoaded,
		mode,
		modeRef,
		cursorRef,
		dragRef,
		repaint,
		applyParts,
		finishRef,
		setMode,
		setVertices,
	]);
}
