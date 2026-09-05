import { mapInteraction } from '@simmer-mosquito/design-tokens';
import {
	circlePolygon,
	distanceMeters,
	type GeoJsonPolygon,
	type LngLat,
	pathLengthMeters,
	polygonAreaMeters,
	polygonPerimeterMeters,
	rectanglePolygon,
} from '@simmer-mosquito/mapping';
import type {
	CircleLayerSpecification,
	ExpressionSpecification,
	FillLayerSpecification,
	GeoJSONSource,
	LineLayerSpecification,
	Map as MapboxMap,
	MapMouseEvent,
} from 'mapbox-gl';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { isAimedAtMap } from './map-keys';
import { useGeoJsonSource } from './use-geojson-source';
import { isMapLive } from './use-mapbox-map';

/**
 * The three shapes a measurement session can put on the map.
 *
 * A line answers "how far", a rectangle and a circle answer "how much ground".
 * There is no polygon tool on purpose: the draw flow already has one for
 * geometry that gets saved, and a measurement is a question, not a record.
 */
export type MeasureTool = 'distance' | 'rectangle' | 'circle';

/** A finished measurement, with the numbers already worked out. */
export interface Measurement {
	readonly id: string;
	readonly tool: MeasureTool;
	/** Metres. Path length for a line, perimeter for a closed shape. */
	readonly lengthMeters: number;
	/** Square metres. Zero for a line. */
	readonly areaMeters: number;
	/** Metres, circles only — the value the user is really setting when dragging. */
	readonly radiusMeters: number | null;
}

/**
 * A value that changes faster than the map can afford to re-render for.
 *
 * The cursor moves every frame and a re-render of the map subtree that often is
 * visible, which is why the cursor is a ref. Anything derived from it is in the
 * same bind: computing it during render means it only refreshes when something
 * else re-renders, and a mousemove is not that. Publishing it here instead lets
 * the one component that wants the number subscribe to it on its own.
 */
export interface LiveValue<T> {
	readonly subscribe: (listener: () => void) => () => void;
	readonly get: () => T;
}

export interface MapMeasureController {
	readonly isMeasuring: boolean;
	readonly tool: MeasureTool | null;
	/** Finished shapes, oldest first. */
	readonly measurements: readonly Measurement[];
	/**
	 * The shape being drawn right now, updating as it moves. Read it with
	 * {@link useMeasureDraft}, which re-renders the reader and nothing else.
	 */
	readonly draft: LiveValue<Measurement | null>;
	/** How many points the current line has, for the undo affordance. */
	readonly draftPointCount: number;
	readonly selectTool: (tool: MeasureTool) => void;
	/** Ends the line in progress. Rectangles and circles finish on their own. */
	readonly finish: () => void;
	/** Removes the last point of a line in progress. */
	readonly undo: () => void;
	/** Drops every shape and leaves measurement mode. Nothing is kept. */
	readonly clear: () => void;
}

const SOURCE_ID = 'map-measure';

/**
 * Measurement styling, deliberately distinct from the amber draft geometry.
 *
 * A measurement is scaffolding — it says something about the map rather than
 * being part of it — so it reads as an overlay rather than as another record.
 */
const measure = {
	fill: mapInteraction.measure,
	outline: mapInteraction.measureStroke,
	vertex: mapInteraction.measureStroke,
	vertexStroke: '#ffffff',
} as const;

const isPolygon: ExpressionSpecification = ['==', ['geometry-type'], 'Polygon'];
const isLine: ExpressionSpecification = ['==', ['geometry-type'], 'LineString'];
const isVertex: ExpressionSpecification = ['==', ['get', 'role'], 'vertex'];

function measureLayers(): (
	| FillLayerSpecification
	| LineLayerSpecification
	| CircleLayerSpecification
)[] {
	return [
		{
			id: `${SOURCE_ID}-fill`,
			type: 'fill',
			source: SOURCE_ID,
			filter: isPolygon,
			paint: { 'fill-color': measure.fill, 'fill-opacity': 0.15 },
		},
		{
			id: `${SOURCE_ID}-outline`,
			type: 'line',
			source: SOURCE_ID,
			filter: isPolygon,
			layout: { 'line-join': 'round' },
			paint: { 'line-color': measure.outline, 'line-width': 2 },
		},
		{
			id: `${SOURCE_ID}-line`,
			type: 'line',
			source: SOURCE_ID,
			filter: isLine,
			layout: { 'line-join': 'round', 'line-cap': 'round' },
			paint: { 'line-color': measure.outline, 'line-width': 2.5 },
		},
		{
			id: `${SOURCE_ID}-vertex`,
			type: 'circle',
			source: SOURCE_ID,
			filter: isVertex,
			paint: {
				'circle-color': measure.vertex,
				'circle-radius': 4,
				'circle-stroke-color': measure.vertexStroke,
				'circle-stroke-width': 2,
			},
		},
	];
}

/** A shape while it is still being placed. */
type Draft =
	| { readonly tool: 'distance'; readonly points: readonly LngLat[] }
	/** Both two-corner tools: the first click anchors, the cursor sets the rest. */
	| { readonly tool: 'rectangle' | 'circle'; readonly anchor: LngLat };

interface Shape {
	readonly id: string;
	readonly tool: MeasureTool;
	readonly geometry: GeoJSON.Geometry;
	readonly measurement: Measurement;
}

/**
 * Runs a measurement session over a live map.
 *
 * Nothing here is persisted, by design (#47): the shapes exist for as long as
 * the session does and go when it ends. That is what lets the interaction stay
 * this direct — no save, no confirmation, no name to give a rectangle whose only
 * purpose was to answer "roughly how many acres is that field".
 */
export function useMapMeasure({
	map,
	isLoaded,
}: {
	readonly map: MapboxMap | null;
	readonly isLoaded: boolean;
}): MapMeasureController {
	const [tool, setTool] = useState<MeasureTool | null>(null);
	const [shapes, setShapes] = useState<readonly Shape[]>([]);
	const [draft, setDraft] = useState<Draft | null>(null);

	// The measurement in progress is published rather than returned by value, so
	// that the readout can follow the cursor without the map re-rendering with it.
	const [draftStore] = useState(() => createLiveStore<Measurement | null>(null, sameMeasurement));

	// The cursor drives the live preview and moves every frame, so it stays out
	// of React state — a re-render per mousemove would be visible on a big map.
	const cursorRef = useRef<LngLat | null>(null);
	const toolRef = useRef(tool);
	toolRef.current = tool;
	const draftRef = useRef(draft);
	draftRef.current = draft;
	const shapesRef = useRef(shapes);
	shapesRef.current = shapes;

	const repaint = useCallback(() => {
		if (!isMapLive(map)) {
			return;
		}
		const collection = buildFeatures(shapesRef.current, draftRef.current, cursorRef.current);
		(map.getSource(SOURCE_ID) as GeoJSONSource | undefined)?.setData(collection);
	}, [map]);

	const publishDraft = useCallback(
		(current: Draft | null) => {
			const shape = current === null ? null : shapeFrom(current, cursorRef.current);
			// The draft row is never keyed against the finished list, so it carries a
			// fixed id rather than a fresh one per frame.
			draftStore.set(shape === null ? null : { ...shape.measurement, id: DRAFT_ID });
		},
		[draftStore],
	);

	// A click, an undo, or an Escape changes the draft in state, and the readout
	// has to follow it there too — not only when the cursor moves.
	useEffect(() => {
		publishDraft(draft);
	}, [draft, publishDraft]);

	// What the source holds after a real state change — a shape finished, a draft
	// started or abandoned. The cursor is deliberately not a dependency: it moves
	// every frame and rides `repaint` instead, so dragging out a rectangle costs
	// no renders.
	const features = useMemo(() => buildFeatures(shapes, draft, cursorRef.current), [shapes, draft]);

	// The source lifecycle — add, re-add on restyle, setData for updates, guarded
	// teardown — is {@link useGeoJsonSource}'s. `onEnsure` repaints from the refs
	// so a basemap switch mid-measurement brings the shapes back as they stand
	// now, cursor included, rather than as of the last render.
	useGeoJsonSource({
		map,
		isLoaded,
		sourceId: SOURCE_ID,
		data: features,
		layers: measureLayers,
		onEnsure: repaint,
	});

	const commitDraft = useCallback(() => {
		const current = draftRef.current;
		const cursor = cursorRef.current;
		const shape = current === null ? null : shapeFrom(current, cursor);
		if (shape !== null) {
			setShapes((previous) => [...previous, shape]);
		}
		setDraft(null);
		cursorRef.current = null;
	}, []);

	const finishRef = useRef(commitDraft);
	finishRef.current = commitDraft;

	// Interaction is wired only while a tool is selected, so a map with the
	// measure panel closed carries no extra listeners and keeps its own cursor.
	useEffect(() => {
		if (!isMapLive(map) || !isLoaded || tool === null) {
			return;
		}
		const activeMap = map;
		const canvas = activeMap.getCanvas();
		const previousCursor = canvas.style.cursor;
		canvas.style.cursor = 'crosshair';
		const doubleClickZoomWasEnabled = activeMap.doubleClickZoom.isEnabled();
		activeMap.doubleClickZoom.disable();

		function handleClick(event: MapMouseEvent) {
			const point: LngLat = { lng: event.lngLat.lng, lat: event.lngLat.lat };
			const current = draftRef.current;
			const activeTool = toolRef.current;
			if (activeTool === null) {
				return;
			}

			if (activeTool === 'distance') {
				setDraft({
					tool: 'distance',
					points:
						current !== null && current.tool === 'distance' ? [...current.points, point] : [point],
				});
				return;
			}

			// Rectangle and circle take exactly two clicks: one to anchor, one to
			// finish. Dragging is not required, which matters on a touch screen.
			if (current === null || current.tool === 'distance') {
				setDraft({ tool: activeTool, anchor: point });
				cursorRef.current = point;
				return;
			}
			cursorRef.current = point;
			finishRef.current();
		}

		function handleMove(event: MapMouseEvent) {
			cursorRef.current = { lng: event.lngLat.lng, lat: event.lngLat.lat };
			publishDraft(draftRef.current);
			repaint();
		}

		function handleDoubleClick() {
			if (draftRef.current?.tool === 'distance') {
				finishRef.current();
			}
		}

		// A measurement is taken while reading the panel beside the map, which is
		// exactly where a stray Enter or Escape comes from. So the listener is on
		// `window` and the keys it answers are the ones the map surface got:
		// {@link isAimedAtMap} is the rule the draw session settled on, and this
		// hook had none of it (#574).
		//
		// No focus move here, unlike a draw. A draft opens on the first map click
		// and mapbox spends no default on `mousedown`, so the canvas has focus by
		// the time there is a shape to finish or throw away. Before that click
		// there is nothing either key can cost, and taking the canvas on
		// `selectTool` would pull focus off the tool button the user just pressed,
		// on every tool switch, for no gain.
		function handleKey(event: KeyboardEvent) {
			if (!isAimedAtMap(activeMap, event.target)) {
				return;
			}
			if (event.key === 'Enter') {
				finishRef.current();
			}
			if (event.key === 'Escape') {
				setDraft(null);
				cursorRef.current = null;
			}
		}

		activeMap.on('click', handleClick);
		activeMap.on('mousemove', handleMove);
		activeMap.on('dblclick', handleDoubleClick);
		window.addEventListener('keydown', handleKey);

		return () => {
			activeMap.off('click', handleClick);
			activeMap.off('mousemove', handleMove);
			activeMap.off('dblclick', handleDoubleClick);
			window.removeEventListener('keydown', handleKey);
			canvas.style.cursor = previousCursor;
			if (doubleClickZoomWasEnabled) {
				activeMap.doubleClickZoom.enable();
			}
		};
	}, [map, isLoaded, tool, publishDraft, repaint]);

	const selectTool = useCallback((next: MeasureTool) => {
		// Switching tools abandons a half-drawn shape rather than trying to
		// reinterpret its points as the new one.
		setDraft(null);
		cursorRef.current = null;
		setTool(next);
	}, []);

	const undo = useCallback(() => {
		setDraft((current) => {
			if (current === null || current.tool !== 'distance') {
				return null;
			}
			const remaining = current.points.slice(0, -1);
			return remaining.length === 0 ? null : { tool: 'distance', points: remaining };
		});
	}, []);

	const clear = useCallback(() => {
		setShapes([]);
		setDraft(null);
		setTool(null);
		cursorRef.current = null;
	}, []);

	return {
		isMeasuring: tool !== null,
		tool,
		measurements: shapes.map((shape) => shape.measurement),
		draft: draftStore,
		draftPointCount: draft?.tool === 'distance' ? draft.points.length : draft === null ? 0 : 1,
		selectTool,
		finish: commitDraft,
		undo,
		clear,
	};
}

/**
 * Subscribes to the measurement in progress.
 *
 * Call this from the readout rather than reading the value through the
 * controller: the point of {@link LiveValue} is that a mousemove re-renders the
 * panel that shows the number and leaves the map alone. The panel is a handful
 * of nodes, so a render per move costs nothing worth throttling.
 */
export function useMeasureDraft(controller: MapMeasureController): Measurement | null {
	const { subscribe, get } = controller.draft;
	return useSyncExternalStore(subscribe, get, get);
}

// ---------------------------------------------------------------------------
// Live values
// ---------------------------------------------------------------------------

const DRAFT_ID = 'measure-draft';

interface LiveStore<T> extends LiveValue<T> {
	/** Notifies subscribers, but only when the value has actually changed. */
	readonly set: (next: T) => void;
}

function createLiveStore<T>(initial: T, isSame: (a: T, b: T) => boolean): LiveStore<T> {
	let value = initial;
	const listeners = new Set<() => void>();
	return {
		subscribe(listener: () => void) {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
		get: () => value,
		set(next: T) {
			// `useSyncExternalStore` re-reads on every notification and compares by
			// identity, and a measurement is rebuilt from scratch each time, so
			// without this every frame of a still cursor would be a render.
			if (isSame(value, next)) {
				return;
			}
			value = next;
			for (const listener of [...listeners]) {
				listener();
			}
		},
	};
}

/** Ids are excluded: a draft's is fixed, so only the numbers can differ. */
function sameMeasurement(a: Measurement | null, b: Measurement | null): boolean {
	if (a === null || b === null) {
		return a === b;
	}
	return (
		a.tool === b.tool &&
		a.lengthMeters === b.lengthMeters &&
		a.areaMeters === b.areaMeters &&
		a.radiusMeters === b.radiusMeters
	);
}

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

let nextShapeId = 1;

/**
 * The finished shape a draft describes, or null when it has not got far enough
 * to measure — one click of a line, or a rectangle with no cursor yet.
 */
function shapeFrom(draft: Draft, cursor: LngLat | null): Shape | null {
	if (draft.tool === 'distance') {
		const points = cursor === null ? draft.points : [...draft.points, cursor];
		if (points.length < 2) {
			return null;
		}
		return {
			id: `measure-${nextShapeId++}`,
			tool: 'distance',
			geometry: { type: 'LineString', coordinates: points.map(toPosition) },
			measurement: {
				id: `measure-${nextShapeId}`,
				tool: 'distance',
				lengthMeters: pathLengthMeters(points),
				areaMeters: 0,
				radiusMeters: null,
			},
		};
	}

	if (cursor === null) {
		return null;
	}

	const polygon: GeoJsonPolygon =
		draft.tool === 'rectangle'
			? rectanglePolygon(draft.anchor, cursor)
			: circlePolygon(draft.anchor, distanceMeters(draft.anchor, cursor), 96);

	return {
		id: `measure-${nextShapeId++}`,
		tool: draft.tool,
		// The mapping package's `GeoJsonPolygon` is a readonly mirror of the same
		// shape `@types/geojson` describes; the two are structurally identical and
		// only differ in mutability, which the GL source does not care about.
		geometry: polygon as unknown as GeoJSON.Geometry,
		measurement: {
			id: `measure-${nextShapeId}`,
			tool: draft.tool,
			lengthMeters: polygonPerimeterMeters(polygon),
			areaMeters: polygonAreaMeters(polygon),
			radiusMeters: draft.tool === 'circle' ? distanceMeters(draft.anchor, cursor) : null,
		},
	};
}

function buildFeatures(
	shapes: readonly Shape[],
	draft: Draft | null,
	cursor: LngLat | null,
): GeoJSON.FeatureCollection {
	const features: GeoJSON.Feature[] = shapes.map((shape) => ({
		type: 'Feature',
		geometry: shape.geometry,
		properties: { role: 'shape', id: shape.id },
	}));

	const preview = draft === null ? null : shapeFrom(draft, cursor);
	if (preview !== null) {
		features.push({
			type: 'Feature',
			geometry: preview.geometry,
			properties: { role: 'draft' },
		});
	}

	// Placed points stay visible so a line in progress reads as a series of
	// decisions rather than as one wandering stroke.
	if (draft?.tool === 'distance') {
		for (const point of draft.points) {
			features.push({
				type: 'Feature',
				geometry: { type: 'Point', coordinates: toPosition(point) },
				properties: { role: 'vertex' },
			});
		}
	}
	if (draft !== null && draft.tool !== 'distance') {
		features.push({
			type: 'Feature',
			geometry: { type: 'Point', coordinates: toPosition(draft.anchor) },
			properties: { role: 'vertex' },
		});
	}

	return { type: 'FeatureCollection', features };
}

function toPosition(point: LngLat): [number, number] {
	return [point.lng, point.lat];
}
