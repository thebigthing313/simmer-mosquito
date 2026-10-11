import type { OwnedGeometryKind } from '@simmer-mosquito/domain';
import type { GeoJSONSource, Map as MapboxMap } from 'mapbox-gl';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { buildFeatures } from '../../components/map/draw-features';
import { drawLayers, SOURCE_ID } from '../../components/map/draw-layers';
import {
	type DrawContext,
	type DrawDispatch,
	type DrawEffect,
	type DrawPoint,
	type DrawPointRejection,
	type DrawState,
	drawView,
	IDLE_DRAW_STATE,
	next,
} from '../../components/map/draw-machine';
import type { DrawGeometry } from '../../components/map/draw-parts';
import { frameOnMap } from '../../components/map/map-camera';
import { useDrawEditEvents } from './use-draw-edit-events';
import { useDrawMapEvents } from './use-draw-map-events';
import { useGeoJsonSource } from './use-geojson-source';
import { isMapLive } from './use-mapbox-map';

/** The draw vocabulary, re-exported from `components/map/draw-parts` for the hook's callers. */
export type {
	DrawContinueDraft,
	DrawEditDraft,
	DrawGeometry,
	DrawGeometryType,
	DrawHoleDraft,
	DrawPartGeometry,
} from '../../components/map/draw-parts';
export {
	drawHoles,
	drawParts,
	geometryFromParts,
	isDrawGeometryType,
	toDrawGeometry,
} from '../../components/map/draw-parts';

import type { MapDrawController } from '../../components/map/draw-controller';

/** What a pending point request is rejected with, by the machine's reason. */
const POINT_REJECTIONS: Record<DrawPointRejection, string> = {
	superseded: 'A new map request replaced this one.',
	cancelled: 'Point selection cancelled.',
};

/**
 * Binds a draft-geometry source and layers to a live map and runs the draw
 * machine in `components/map/draw-machine` over map input and the controller's
 * actions. This is the machine's adapter: it holds the state, dispatches the
 * events, and runs the effects each transition names.
 *
 * Renders the committed `value` part by part, and a live preview of the placed
 * vertices with a rubber-band segment to the cursor while drawing. Point
 * finishes on the first click; line and polygon collect vertices until the
 * caller finishes from the toolbar, a double-click or Enter. A draw either
 * replaces the whole shape or adds one part to it, and the parts already
 * committed stay on the map through an add. Undo pops inside the part being
 * drawn and stops at zero vertices.
 */
export function useMapDraw({
	map,
	isLoaded,
	value,
	onChange,
	geometryKind,
}: {
	readonly map: MapboxMap | null;
	readonly isLoaded: boolean;
	readonly value: DrawGeometry | null;
	readonly onChange: (value: DrawGeometry | null) => void;
	/**
	 * The record kind whose geometry this draws, which is what says whether a
	 * split has anywhere to put its second piece. Omitted where the caller drives
	 * the control for a single point and never opens a part, as the address form
	 * does; a split refuses there.
	 */
	readonly geometryKind?: OwnedGeometryKind;
}): MapDrawController {
	// What a render reads. The cursor and the drag are left out: both move every
	// frame and ride `repaint` instead, so a mousemove repaints the rubber band
	// without re-rendering anything.
	const [rendered, setRendered] =
		useState<Pick<DrawState, 'mode' | 'vertices' | 'highlighted'>>(IDLE_DRAW_STATE);
	const { mode, vertices, highlighted } = rendered;

	// The whole state, written by `dispatch` the moment an event lands, because a
	// handler can fire several events in one tick and each has to see the last.
	// Render never reads it: it reads `rendered`, which `dispatch` keeps in step.
	const stateRef = useRef<DrawState>(IDLE_DRAW_STATE);
	const contextRef = useRef<DrawContext>({ value, geometryKind });
	const onChangeRef = useRef(onChange);
	// The pending point request's callbacks. The machine holds only that a point
	// is pending, and says through an effect what happens to it.
	const pendingRef = useRef<{
		readonly resolve: (point: DrawPoint) => void;
		readonly reject: (error: Error) => void;
	} | null>(null);

	// The writes are an effect rather than render-phase assignments, which is what
	// the React Compiler permits. Every reader is an event handler or an effect, so
	// the value each one sees is unchanged.
	useEffect(() => {
		contextRef.current = { value, geometryKind };
		onChangeRef.current = onChange;
	});

	const repaint = () => {
		if (!isMapLive(map)) {
			return;
		}
		const state = stateRef.current;
		const source = map.getSource(SOURCE_ID) as GeoJSONSource | undefined;
		source?.setData(
			buildFeatures({
				committed: contextRef.current.value,
				mode: state.mode,
				vertices: state.vertices,
				cursor: state.cursor,
				drag: state.drag,
				highlighted: state.highlighted,
			}),
		);
	};
	// `repaint` reads only refs and the map, so the effect below reaches it as an effect event.
	const repaintNow = useEffectEvent(() => {
		repaint();
	});

	const settle = (effect: DrawEffect) => {
		switch (effect.kind) {
			case 'emit':
				onChangeRef.current(effect.geometry);
				return;
			case 'resolvePoint':
				pendingRef.current?.resolve(effect.point);
				pendingRef.current = null;
				return;
			case 'rejectPoint':
				pendingRef.current?.reject(new Error(POINT_REJECTIONS[effect.reason]));
				pendingRef.current = null;
				return;
			case 'frame':
				if (isMapLive(map)) {
					frameOnMap(map, effect.part, { purpose: 'record', animate: true });
				}
				return;
		}
	};

	// The one place the draw state is written. A change to what a render reads
	// re-renders; a change to the cursor or the drag alone repaints and nothing
	// else, which is what keeps the rubber band at frame rate.
	const dispatch: DrawDispatch = (event) => {
		const previous = stateRef.current;
		const { state, effects } = next(previous, event, contextRef.current);
		stateRef.current = state;
		if (
			state.mode !== previous.mode ||
			state.vertices !== previous.vertices ||
			state.highlighted !== previous.highlighted
		) {
			setRendered({ mode: state.mode, vertices: state.vertices, highlighted: state.highlighted });
		} else if (state.cursor !== previous.cursor || state.drag !== previous.drag) {
			repaint();
		}
		for (const effect of effects) {
			settle(effect);
		}
		return { previous, state };
	};

	// The cursor and the drag are left off here and layered back on by `repaint`.
	const features = buildFeatures({
		committed: value,
		mode,
		vertices,
		cursor: null,
		drag: null,
		highlighted,
	});

	// `onEnsure` repaints from the ref, so a restyle brings the cursor back too.
	useGeoJsonSource({
		map,
		isLoaded,
		sourceId: SOURCE_ID,
		data: features,
		layers: drawLayers,
		onEnsure: repaint,
	});

	// Declared after the source so its `setData` has already run.
	// biome-ignore lint/correctness/useExhaustiveDependencies: `features` is the trigger rather than something the effect reads, and dropping it would stop the transients coming back after a state change.
	useEffect(() => {
		repaintNow();
	}, [features]);

	useDrawMapEvents({ map, isLoaded, mode, dispatch });
	useDrawEditEvents({ map, isLoaded, isEditing: mode.kind === 'edit', dispatch });

	const requestPoint = (_prompt?: string) =>
		new Promise<DrawPoint>((resolve, reject) => {
			if (!isMapLive(map)) {
				reject(new Error('The map is not ready yet.'));
				return;
			}
			// Dispatched before the new callbacks are held, so a request already
			// pending is the one the superseded rejection reaches.
			dispatch({ type: 'requestPoint' });
			pendingRef.current = { resolve, reject };
		});

	// One method per action, each one dispatch, because `MapDrawController` names
	// the actions the forms, the toolbar and the part list call.
	return {
		...drawView(rendered, value),
		start: (drawType) => {
			dispatch({ type: 'start', drawType });
		},
		startPart: () => {
			dispatch({ type: 'startPart' });
		},
		startHole: (partIndex) => {
			dispatch({ type: 'startHole', partIndex });
		},
		continuePart: (partIndex) => {
			dispatch({ type: 'continuePart', partIndex });
		},
		editPart: (partIndex) => {
			dispatch({ type: 'editPart', partIndex });
		},
		moveVertex: (vertex, position) => {
			dispatch({ type: 'moveVertex', vertex, position });
		},
		insertVertex: (edge, position) => {
			dispatch({ type: 'insertVertex', edge, position });
		},
		deleteVertex: (vertex) => {
			dispatch({ type: 'deleteVertex', vertex });
		},
		selectVertex: (vertex) => {
			dispatch({ type: 'selectVertex', vertex });
		},
		startReshape: () => {
			dispatch({ type: 'startReshape' });
		},
		startSplit: () => {
			dispatch({ type: 'startSplit' });
		},
		removePart: (partIndex) => {
			dispatch({ type: 'removePart', partIndex });
		},
		removeHole: (partIndex, holeIndex) => {
			dispatch({ type: 'removeHole', partIndex, holeIndex });
		},
		highlightPart: (partIndex) => {
			dispatch({ type: 'highlightPart', partIndex });
		},
		zoomToPart: (partIndex) => {
			dispatch({ type: 'zoomToPart', partIndex });
		},
		finish: () => {
			dispatch({ type: 'finish' });
		},
		cancel: () => {
			dispatch({ type: 'cancel' });
		},
		undo: () => {
			dispatch({ type: 'undo' });
		},
		commit: (geometry) => {
			dispatch({ type: 'commit', geometry });
		},
		requestPoint,
	};
}
