import type { OwnedGeometryKind } from '@simmer-mosquito/domain';
import type { PlanarPosition } from '@simmer-mosquito/mapping';
import type { GeoJSONSource, Map as MapboxMap } from 'mapbox-gl';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { buildFeatures } from '../../components/map/draw-features';
import { drawLayers, SOURCE_ID } from '../../components/map/draw-layers';
import {
	type DrawDrag,
	type DrawGeometry,
	draftProgress,
	type Mode,
} from '../../components/map/draw-parts';
import { useDrawDrafts } from './use-draw-drafts';
import { useDrawEditEvents } from './use-draw-edit-events';
import { useDrawMapEvents } from './use-draw-map-events';
import { useDrawPartActions } from './use-draw-part-actions';
import { useDrawSession } from './use-draw-session';
import { useDrawVertexActions } from './use-draw-vertex-actions';
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

/**
 * Binds a draft-geometry source and layers to a live map and runs the draw
 * state machine over map clicks.
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
	const [mode, setMode] = useState<Mode>({ kind: 'idle' });
	const [vertices, setVertices] = useState<readonly PlanarPosition[]>([]);

	// Frequently-changing render inputs live in refs so the rubber band can be
	// repainted on mousemove without a React re-render per frame.
	const cursorRef = useRef<PlanarPosition | null>(null);
	const modeRef = useRef(mode);
	const verticesRef = useRef(vertices);
	const valueRef = useRef(value);
	const onChangeRef = useRef(onChange);

	// The writes are an effect rather than render-phase assignments, which is what
	// the React Compiler permits. Every read below happens after a commit, from an
	// effect or from a Mapbox pointer event, so the value each one sees is
	// unchanged. The effect is declared above its readers, so the write lands first
	// inside one commit.
	useEffect(() => {
		modeRef.current = mode;
		verticesRef.current = vertices;
		valueRef.current = value;
		onChangeRef.current = onChange;
	});

	// The vertex the pointer has hold of rides a ref rather than state, the way
	// the rubber band does: a drag repaints every frame and lands as one change.
	const dragRef = useRef<DrawDrag | null>(null);

	const {
		applyParts,
		continuePart,
		editPart,
		highlightedPart,
		highlightedRef,
		highlightPart,
		removeHole,
		removePart,
		startHole,
		startPart,
		zoomToPart,
	} = useDrawPartActions({
		map,
		geometryKind,
		cursorRef,
		dragRef,
		modeRef,
		valueRef,
		onChangeRef,
		setMode,
		setVertices,
	});

	const { holeDraft, continuedPart, editedPart } = useDrawDrafts(mode, value, vertices);

	const repaint = () => {
		if (!isMapLive(map)) {
			return;
		}
		const source = map.getSource(SOURCE_ID) as GeoJSONSource | undefined;
		source?.setData(
			buildFeatures({
				committed: valueRef.current,
				mode: modeRef.current,
				vertices: verticesRef.current,
				cursor: cursorRef.current,
				drag: dragRef.current,
				highlighted: highlightedRef.current,
			}),
		);
	};
	// `repaint` reads only refs and the map, so it is never what an effect reacts
	// to, and naming it in a dependency array would say otherwise. The effect below
	// reaches it through an effect event; the ordinary function stays for
	// `onEnsure` and the two inner hooks, which are call sites outside an effect.
	const repaintNow = useEffectEvent(() => {
		repaint();
	});

	// What the draft source holds after a real state change: a new committed value,
	// another vertex, a mode switch. The cursor and the drag are not here at all.
	// Both move every frame and ride `repaint` instead, so a mousemove repaints the
	// rubber band without re-rendering anything, and reading them here was a
	// render-phase ref read of what the map is currently showing, which is
	// commit-time information rather than render-time.
	const features = buildFeatures({
		committed: value,
		mode,
		vertices,
		cursor: null,
		drag: null,
		highlighted: highlightedPart,
	});

	// The source lifecycle — add, re-add on restyle, setData for updates, guarded
	// teardown — is {@link useGeoJsonSource}'s. `onEnsure` repaints from the refs
	// so a basemap switch mid-draw brings back the shape as it stands now, cursor
	// included, rather than as of the last render.
	useGeoJsonSource({
		map,
		isLoaded,
		sourceId: SOURCE_ID,
		data: features,
		layers: drawLayers,
		onEnsure: repaint,
	});

	// `features` carries no cursor and no drag, so the source has just been set to
	// the committed shape without the transients on it. Layering them back on is
	// `repaint`'s job, and this is the commit-time moment to do it. Declared after
	// the source primitive so its `setData` has already run.
	// biome-ignore lint/correctness/useExhaustiveDependencies: `features` is the trigger rather than something the effect reads, and dropping it would stop the transients coming back after a state change.
	useEffect(() => {
		repaintNow();
	}, [features]);

	const finishRef = useRef<() => void>(() => {});

	useDrawMapEvents({
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
	});

	const {
		selectVertex,
		moveVertex,
		insertVertex,
		deleteVertex,
		startReshape,
		startSplit,
		sketchVertex,
	} = useDrawVertexActions(setMode);

	const { start, cancel, commit, undo, finish, requestPoint } = useDrawSession({
		map,
		applyParts,
		highlightPart,
		cursorRef,
		dragRef,
		modeRef,
		valueRef,
		verticesRef,
		onChangeRef,
		finishRef,
		setMode,
		setVertices,
	});

	useDrawEditEvents({
		map,
		isLoaded,
		isEditing: mode.kind === 'edit',
		modeRef,
		cursorRef,
		dragRef,
		repaint,
		moveVertex,
		insertVertex,
		deleteVertex,
		selectVertex,
		sketchVertex,
	});

	const progress = draftProgress(mode, value, vertices);

	return {
		isDrawing: mode.kind === 'draw' || mode.kind === 'edit',
		isAddingPart: mode.kind === 'draw' && mode.target.kind === 'part',
		isRequestingPoint: mode.kind === 'point',
		...progress,
		start,
		startPart,
		startHole,
		continuePart,
		continuedPart,
		editPart,
		editedPart,
		moveVertex,
		insertVertex,
		deleteVertex,
		selectVertex,
		startReshape,
		startSplit,
		removePart,
		removeHole,
		holeDraft,
		highlightPart,
		zoomToPart,
		finish,
		cancel,
		undo,
		commit,
		requestPoint,
	};
}
