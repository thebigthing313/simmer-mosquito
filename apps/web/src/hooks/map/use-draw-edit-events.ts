import type { Map as MapboxMap, MapMouseEvent } from 'mapbox-gl';
import { useEffect } from 'react';
import { isOverEdge, vertexUnder } from '../../components/map/draw-layers';
import type { DrawDispatch } from '../../components/map/draw-machine';
import { isSketching } from '../../components/map/draw-parts';
import { isAimedAtMap } from '../../components/map/map-keys';
import { isMapLive } from './use-mapbox-map';

/**
 * The pointer half of editing: grab, drag, drop, click a vertex or an edge,
 * Delete, and the clicks that trace a sketch. Live only while a part is open for
 * editing. It reads what is under the pointer off the map and hands the gesture
 * to `dispatch`; what the gesture does to the rings is the machine's.
 */
export function useDrawEditEvents({
	map,
	isLoaded,
	isEditing,
	dispatch,
}: {
	readonly map: MapboxMap | null;
	readonly isLoaded: boolean;
	readonly isEditing: boolean;
	readonly dispatch: DrawDispatch;
}): void {
	useEffect(() => {
		if (!isMapLive(map) || !isLoaded || !isEditing) {
			return;
		}
		const activeMap = map;
		const canvas = activeMap.getCanvas();

		function handleDown(event: MapMouseEvent) {
			const vertex = vertexUnder(activeMap, event);
			if (vertex === null) {
				return;
			}
			const { state } = dispatch({
				type: 'grab',
				vertex,
				position: [event.lngLat.lng, event.lngLat.lat],
			});
			// Mapbox pans on a drag unless the gesture is claimed here, so the map
			// would slide out from under the vertex being moved. An open sketch
			// refuses the grab, and the map pans as usual.
			if (state.drag !== null) {
				event.preventDefault();
			}
		}

		// The machine moves the grabbed vertex or the sketch's rubber band, and the
		// adapter repaints it without a render, so it follows the cursor at frame
		// rate. What is left here is the cursor's shape.
		function handleMove(event: MapMouseEvent) {
			const { state } = dispatch({
				type: 'move',
				position: [event.lngLat.lng, event.lngLat.lat],
			});
			if (isSketching(state.mode)) {
				canvas.style.cursor = 'crosshair';
				return;
			}
			if (state.drag !== null) {
				canvas.style.cursor = 'grabbing';
				return;
			}
			canvas.style.cursor = vertexUnder(activeMap, event) === null ? 'crosshair' : 'move';
		}

		// On the window rather than the map, because a button released off the
		// canvas never reaches the map and would leave the vertex following the
		// cursor with nothing to drop it.
		function handleUp() {
			dispatch({ type: 'release' });
		}

		function handleClick(event: MapMouseEvent) {
			dispatch({
				type: 'editClick',
				position: [event.lngLat.lng, event.lngLat.lat],
				vertex: vertexUnder(activeMap, event),
				overEdge: isOverEdge(activeMap, event),
			});
		}

		// Backspace as well as Delete, because a laptop keyboard often has only the
		// one key. That is also why the surface guard is here and not optional: the
		// location panel sits beside the map, and a backspace meant for a
		// description would otherwise take a corner off the shape. The key is
		// claimed only when a vertex was picked to take.
		function handleKeyDown(event: KeyboardEvent) {
			if (
				(event.key !== 'Delete' && event.key !== 'Backspace') ||
				!isAimedAtMap(activeMap, event.target)
			) {
				return;
			}
			const { previous } = dispatch({ type: 'deleteSelected' });
			if (
				previous.mode.kind === 'edit' &&
				previous.mode.selected !== null &&
				previous.mode.sketch === null
			) {
				event.preventDefault();
			}
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
			// The mouseup that would land a held vertex has just lost its listener.
			dispatch({ type: 'dropDrag' });
		};
	}, [map, isLoaded, isEditing, dispatch]);
}
