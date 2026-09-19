import {
	type DrawVertexRef,
	nearestRingEdge,
	type PlanarPosition,
	samePlanarPosition,
} from '@simmer-mosquito/mapping';
import type { Map as MapboxMap, MapMouseEvent } from 'mapbox-gl';
import { useEffect } from 'react';
import { isOverEdge, vertexUnder } from '../../components/map/draw-layers';
import { type DrawDrag, isSketching, type Mode } from '../../components/map/draw-parts';
import { isAimedAtMap } from '../../components/map/map-keys';
import { isMapLive } from './use-mapbox-map';

/**
 * The pointer half of editing: grab, drag, drop, click an edge, Delete, and the
 * clicks that trace a reshape line. Live only while a part is open for editing.
 * An open sketch takes the pointer over completely, so every vertex gesture is
 * off until the sketch has landed.
 */
export function useDrawEditEvents({
	map,
	isLoaded,
	isEditing,
	modeRef,
	cursorRef,
	dragRef,
	repaint,
	moveVertex,
	insertVertex,
	deleteVertex,
	selectVertex,
	sketchVertex,
}: {
	readonly map: MapboxMap | null;
	readonly isLoaded: boolean;
	readonly isEditing: boolean;
	readonly modeRef: { current: Mode };
	readonly cursorRef: { current: PlanarPosition | null };
	readonly dragRef: { current: DrawDrag | null };
	readonly repaint: () => void;
	readonly moveVertex: (vertex: DrawVertexRef, position: PlanarPosition) => void;
	readonly insertVertex: (edge: DrawVertexRef, position: PlanarPosition) => void;
	readonly deleteVertex: (vertex: DrawVertexRef) => void;
	readonly selectVertex: (vertex: DrawVertexRef | null) => void;
	readonly sketchVertex: (position: PlanarPosition) => void;
}): void {
	useEffect(() => {
		if (!isMapLive(map) || !isLoaded || !isEditing) {
			return;
		}
		const activeMap = map;
		const canvas = activeMap.getCanvas();

		function handleDown(event: MapMouseEvent) {
			const vertex = isSketching(modeRef.current) ? null : vertexUnder(activeMap, event);
			if (vertex === null) {
				return;
			}
			// Mapbox pans on a drag unless the gesture is claimed here, so the map
			// would slide out from under the vertex being moved.
			event.preventDefault();
			dragRef.current = { vertex, position: [event.lngLat.lng, event.lngLat.lat] };
			selectVertex(vertex);
		}

		// A drag repaints from the ref rather than through state, so the vertex
		// follows the cursor at frame rate and the move lands as one change.
		function handleMove(event: MapMouseEvent) {
			// The sketch trails the cursor the way a draw's rubber band does, and the
			// reshape it would make is repainted with it.
			if (isSketching(modeRef.current)) {
				cursorRef.current = [event.lngLat.lng, event.lngLat.lat];
				canvas.style.cursor = 'crosshair';
				repaint();
				return;
			}
			const drag = dragRef.current;
			if (drag !== null) {
				dragRef.current = { vertex: drag.vertex, position: [event.lngLat.lng, event.lngLat.lat] };
				canvas.style.cursor = 'grabbing';
				repaint();
				return;
			}
			canvas.style.cursor = vertexUnder(activeMap, event) === null ? 'crosshair' : 'move';
		}

		// On the window rather than the map, because a button released off the canvas
		// never reaches the map and would leave the vertex following the cursor with
		// nothing to drop it. The drag's own last position is where it lands: past
		// the canvas edge there is no longer a map coordinate to read.
		function handleUp() {
			const drag = dragRef.current;
			dragRef.current = null;
			const current = modeRef.current;
			if (drag === null || current.kind !== 'edit') {
				return;
			}
			// A click on a vertex is a mousedown and a mouseup in one spot. Landing it
			// as a move would cost an Undo step that took nothing back.
			const from = current.rings[drag.vertex.ring]?.[drag.vertex.vertex];
			if (from !== undefined && !samePlanarPosition(from, drag.position)) {
				moveVertex(drag.vertex, drag.position);
			}
			repaint();
		}

		function handleClick(event: MapMouseEvent) {
			if (isSketching(modeRef.current)) {
				sketchVertex([event.lngLat.lng, event.lngLat.lat]);
				return;
			}
			const vertex = vertexUnder(activeMap, event);
			if (vertex !== null) {
				selectVertex(vertex);
				return;
			}
			const current = modeRef.current;
			const position: PlanarPosition = [event.lngLat.lng, event.lngLat.lat];
			// Only the boundary, not the fill: a click in the middle of an area is not
			// aimed at an edge, and inserting on the nearest one would be a guess.
			const edge =
				current.kind === 'edit' && isOverEdge(activeMap, event)
					? nearestRingEdge(current.rings, position, current.type === 'Polygon')
					: null;
			if (edge === null) {
				selectVertex(null);
				return;
			}
			insertVertex(edge, position);
		}

		// Backspace as well as Delete, because a laptop keyboard often has only the
		// one key. That is also why the surface guard is here and not optional: the
		// location panel sits beside the map, and a backspace meant for a
		// description would otherwise take a corner off the shape.
		function handleKeyDown(event: KeyboardEvent) {
			if (event.key !== 'Delete' && event.key !== 'Backspace') {
				return;
			}
			const current = modeRef.current;
			if (
				current.kind !== 'edit' ||
				current.selected === null ||
				current.sketch !== null ||
				!isAimedAtMap(activeMap, event.target)
			) {
				return;
			}
			event.preventDefault();
			deleteVertex(current.selected);
		}

		activeMap.on('mousedown', handleDown);
		activeMap.on('mousemove', handleMove);
		activeMap.on('click', handleClick);
		window.addEventListener('mouseup', handleUp);
		window.addEventListener('keydown', handleKeyDown);

		return () => {
			activeMap.off('mousedown', handleDown);
			activeMap.off('mousemove', handleMove);
			activeMap.off('click', handleClick);
			window.removeEventListener('mouseup', handleUp);
			window.removeEventListener('keydown', handleKeyDown);
			dragRef.current = null;
		};
	}, [
		map,
		isLoaded,
		isEditing,
		modeRef,
		cursorRef,
		dragRef,
		repaint,
		moveVertex,
		insertVertex,
		deleteVertex,
		selectVertex,
		sketchVertex,
	]);
}
