import { mapInteraction } from '@simmer-mosquito/design-tokens';
import {
	type BaseGeometryType,
	geometryCoversGround,
	getMultipartGeometryType,
	isBaseGeometryType,
	isSupportedGeometryType,
} from '@simmer-mosquito/domain';
import { boundsFromGeoJson, type GeoJsonGeometry } from '@simmer-mosquito/mapping';
import type {
	CircleLayerSpecification,
	ExpressionSpecification,
	FillLayerSpecification,
	GeoJSONSource,
	LineLayerSpecification,
	Map as MapboxMap,
	MapMouseEvent,
} from 'mapbox-gl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useGeoJsonSource } from './use-geojson-source';
import { isMapLive } from './use-mapbox-map';

type Position = readonly [number, number];
type Ring = readonly Position[];
type PolygonRings = readonly Ring[];

/**
 * The shape the type toggle offers, which is the domain's base shapes.
 *
 * Deliberately not `DrawGeometry['type']`. A record promotes to its multi shape
 * on gaining a second part and demotes on losing one, so a multi shape is
 * something the control arrives at and never something the user picks.
 */
export type DrawGeometryType = BaseGeometryType;

/**
 * A geometry a record form can produce. Mirrors the GeoJSON shape a command's
 * `locationSource.geometry` expects, so a finished draft can be handed straight
 * to the optimistic mutation without translation.
 *
 * All six shapes, because the control draws in parts. Positions are pairs rather
 * than the domain's optional triple: nothing here places an altitude and the
 * point paths read `coordinates[0]` and `[1]` directly.
 */
export type DrawGeometry =
	| { readonly type: 'Point'; readonly coordinates: Position }
	| { readonly type: 'LineString'; readonly coordinates: Ring }
	| { readonly type: 'Polygon'; readonly coordinates: PolygonRings }
	| { readonly type: 'MultiPoint'; readonly coordinates: Ring }
	| { readonly type: 'MultiLineString'; readonly coordinates: PolygonRings }
	| { readonly type: 'MultiPolygon'; readonly coordinates: readonly PolygonRings[] };

/**
 * One part of a drawn shape, carried as the single-part geometry it would be on
 * its own.
 *
 * A part is a geometry rather than a bare coordinate list so that everything
 * already written against a geometry works on one: the map renders it, the
 * bounds reader frames it, and the part row labels it.
 */
export type DrawPartGeometry = Extract<DrawGeometry, { readonly type: DrawGeometryType }>;

/**
 * Whether `value` names a shape the type toggle offers.
 *
 * The domain's register is what says which shapes exist; three files used to
 * spell the same three names out by hand instead.
 */
export function isDrawGeometryType(value: unknown): value is DrawGeometryType {
	return isBaseGeometryType(value);
}

/**
 * Read a stored geometry back into something the draw flow can edit.
 *
 * All six shapes now, because the part list is the affordance whose absence used
 * to justify reading a multi shape as "no geometry" and quietly leaving the
 * record whatever it held. A `GeometryCollection` still reads as none: it has no
 * `coordinates`, and the parts of one are not parts of a single shape.
 */
export function toDrawGeometry(geojson: unknown): DrawGeometry | null {
	if (geojson === null || typeof geojson !== 'object') {
		return null;
	}
	const candidate = geojson as { readonly type?: unknown; readonly coordinates?: unknown };
	// A type-only geometry would crash the summary and the preview, so require
	// coordinates to be present and non-empty.
	if (!Array.isArray(candidate.coordinates) || candidate.coordinates.length === 0) {
		return null;
	}
	return isSupportedGeometryType(candidate.type) ? (candidate as DrawGeometry) : null;
}

/**
 * The parts of `geometry`, in stored order, one entry for a single-part shape.
 *
 * The one place a multi shape is taken apart. The part list, the map draft and
 * Remove all read it, so "how many pieces is this" has a single answer.
 */
export function drawParts(geometry: DrawGeometry | null): readonly DrawPartGeometry[] {
	if (geometry === null) {
		return [];
	}
	switch (geometry.type) {
		case 'MultiPoint':
			return geometry.coordinates.map((coordinates) => ({ type: 'Point', coordinates }));
		case 'MultiLineString':
			return geometry.coordinates.map((coordinates) => ({ type: 'LineString', coordinates }));
		case 'MultiPolygon':
			return geometry.coordinates.map((coordinates) => ({ type: 'Polygon', coordinates }));
		default:
			return [geometry];
	}
}

/**
 * The shape `parts` make: the part itself at one, the multi shape at two or more,
 * nothing at zero.
 *
 * Promote and demote in place, so a one-part multi shape never leaves here. The
 * domain demotes one on the way in as well, and the two agreeing is what lets a
 * removed part put the record back on its base shape without a second write.
 */
export function geometryFromParts(parts: readonly DrawPartGeometry[]): DrawGeometry | null {
	const first = parts[0];
	if (first === undefined) {
		return null;
	}
	if (parts.length === 1) {
		return first;
	}
	switch (first.type) {
		case 'Point':
			return {
				type: getMultipartGeometryType('Point'),
				coordinates: parts.flatMap((part) => (part.type === 'Point' ? [part.coordinates] : [])),
			};
		case 'LineString':
			return {
				type: getMultipartGeometryType('LineString'),
				coordinates: parts.flatMap((part) =>
					part.type === 'LineString' ? [part.coordinates] : [],
				),
			};
		default:
			return {
				type: getMultipartGeometryType('Polygon'),
				coordinates: parts.flatMap((part) => (part.type === 'Polygon' ? [part.coordinates] : [])),
			};
	}
}

/**
 * The draw controller surface the form panel and the on-map toolbar both drive.
 * `start` is wired to the form's "Draw geometry" button; `finish`/`cancel`/`undo`
 * live on the floating map toolbar so the user exits draw mode from the map.
 */
export interface MapDrawController {
	readonly isDrawing: boolean;
	/** The draw in progress appends a part rather than replacing the shape. */
	readonly isAddingPart: boolean;
	readonly isRequestingPoint: boolean;
	readonly drawType: DrawGeometryType | null;
	readonly vertexCount: number;
	readonly canFinish: boolean;
	readonly start: (type: DrawGeometryType) => void;
	/**
	 * Draw one more part of the shape already committed, leaving the rest of it on
	 * the map to draw against. A no-op with nothing committed: the first part is
	 * `start`'s.
	 */
	readonly startPart: () => void;
	/** Drop one part, demoting to the base shape at one and to nothing at zero. */
	readonly removePart: (index: number) => void;
	/** Pick out one part on the map, or clear the highlight with `null`. */
	readonly highlightPart: (index: number | null) => void;
	readonly zoomToPart: (index: number) => void;
	readonly finish: () => void;
	readonly cancel: () => void;
	readonly undo: () => void;
	/**
	 * Adopt a geometry the user obtained some other way — an existing region's
	 * boundary, a shape read out of an uploaded file — as if it had just been
	 * drawn. Any in-progress draw is abandoned so the map shows only the result.
	 */
	readonly commit: (geometry: DrawGeometry | null) => void;
	/**
	 * Capture a single map click as a point — used by the address subform's
	 * "place on map" path. Resolves on the next click, rejects if superseded.
	 */
	readonly requestPoint: (prompt?: string) => Promise<DrawGeometry & { readonly type: 'Point' }>;
}

const SOURCE_ID = 'habitat-draw';

// Amber draft styling, deliberately distinct from the green reference habitats
// (vector tiles) and the blue detail overlay, so "the new/edited site" reads as
// its own active layer at a glance.
//
// These are the shared selection colours, not a private amber: the thing being
// drawn *is* the selected spatial context, and it has to match the selection
// halo the tile layers paint so the two never disagree on screen.
const draft = {
	fill: mapInteraction.selected,
	outline: mapInteraction.selectedStroke,
	line: mapInteraction.selected,
	vertex: mapInteraction.selected,
	vertexStroke: '#ffffff',
	point: mapInteraction.selected,
	pointStroke: '#ffffff',
} as const;

const isPolygon: ExpressionSpecification = ['==', ['geometry-type'], 'Polygon'];
const isLine: ExpressionSpecification = ['==', ['geometry-type'], 'LineString'];
const isVertex: ExpressionSpecification = ['==', ['get', 'role'], 'vertex'];
const isPoint: ExpressionSpecification = ['==', ['get', 'role'], 'point'];

/**
 * Which part the pointer is over, picked out by weight rather than by a second
 * colour. A part is not a different kind of thing from the shape it belongs to,
 * so hovering a row thickens and fills it instead of recolouring it.
 */
function whenHighlighted(highlighted: number, rest: number): ExpressionSpecification {
	return ['case', ['boolean', ['get', 'highlighted'], false], highlighted, rest];
}

function drawLayers(): (
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
			paint: { 'fill-color': draft.fill, 'fill-opacity': whenHighlighted(0.42, 0.18) },
		},
		{
			id: `${SOURCE_ID}-outline`,
			type: 'line',
			source: SOURCE_ID,
			filter: isPolygon,
			layout: { 'line-join': 'round' },
			paint: { 'line-color': draft.outline, 'line-width': whenHighlighted(4.5, 2.5) },
		},
		{
			id: `${SOURCE_ID}-line`,
			type: 'line',
			source: SOURCE_ID,
			filter: isLine,
			layout: { 'line-join': 'round', 'line-cap': 'round' },
			paint: {
				'line-color': draft.line,
				'line-width': whenHighlighted(5, 3),
				'line-dasharray': [2, 1],
			},
		},
		{
			id: `${SOURCE_ID}-vertex`,
			type: 'circle',
			source: SOURCE_ID,
			filter: isVertex,
			paint: {
				'circle-color': draft.vertex,
				'circle-radius': 5,
				'circle-stroke-color': draft.vertexStroke,
				'circle-stroke-width': 2,
			},
		},
		{
			id: `${SOURCE_ID}-point`,
			type: 'circle',
			source: SOURCE_ID,
			filter: isPoint,
			paint: {
				'circle-color': draft.point,
				'circle-radius': whenHighlighted(11, 8),
				'circle-stroke-color': draft.pointStroke,
				'circle-stroke-width': 3,
			},
		},
	];
}

const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

/**
 * What a finished draw does with the parts already committed. `replace` takes
 * every one of them, which is what "Redraw geometry" means at any part count;
 * `part` appends.
 */
type DrawTarget = 'replace' | 'part';

type Mode =
	| { readonly kind: 'idle' }
	| { readonly kind: 'draw'; readonly type: DrawGeometryType; readonly target: DrawTarget }
	| {
			readonly kind: 'point';
			readonly resolve: (point: DrawGeometry & { readonly type: 'Point' }) => void;
			readonly reject: (error: Error) => void;
	  };

/**
 * Binds a draft-geometry source + layers to a live map and runs a small draw
 * state machine over map clicks. Renders the committed `value` part by part, and
 * a live preview (placed vertices + a rubber-band segment to the cursor) while
 * drawing. Point finishes on the first click; line/polygon collect vertices
 * until the caller finishes from the map toolbar (or double-click / Enter).
 *
 * A draw either replaces the whole shape or adds one part to it, and the parts
 * already committed stay on the map through an add so the user draws against
 * them. Undo pops inside the part being drawn and stops at zero vertices, so
 * nothing it does can reopen a part that is already finished.
 */
export function useMapDraw({
	map,
	isLoaded,
	value,
	onChange,
}: {
	readonly map: MapboxMap | null;
	readonly isLoaded: boolean;
	readonly value: DrawGeometry | null;
	readonly onChange: (value: DrawGeometry | null) => void;
}): MapDrawController {
	const [mode, setMode] = useState<Mode>({ kind: 'idle' });
	const [vertices, setVertices] = useState<readonly Position[]>([]);

	// Frequently-changing render inputs live in refs so the rubber band can be
	// repainted on mousemove without a React re-render per frame.
	const cursorRef = useRef<Position | null>(null);
	const modeRef = useRef(mode);
	modeRef.current = mode;
	const verticesRef = useRef(vertices);
	verticesRef.current = vertices;
	const valueRef = useRef(value);
	valueRef.current = value;
	const onChangeRef = useRef(onChange);
	onChangeRef.current = onChange;

	const {
		applyPart,
		highlightedPart,
		highlightedRef,
		highlightPart,
		removePart,
		startPart,
		zoomToPart,
	} = useDrawPartActions({ map, cursorRef, modeRef, valueRef, onChangeRef, setMode, setVertices });

	const repaint = useCallback(() => {
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
				highlighted: highlightedRef.current,
			}),
		);
	}, [map, highlightedRef]);

	// What the draft source holds after a real state change — a new committed
	// value, another vertex, a mode switch. The cursor is deliberately not a
	// dependency: it moves every frame and rides `repaint` instead, so a
	// mousemove repaints the rubber band without re-rendering anything.
	const features = useMemo(
		() =>
			buildFeatures({
				committed: value,
				mode,
				vertices,
				cursor: cursorRef.current,
				highlighted: highlightedPart,
			}),
		[value, mode, vertices, highlightedPart],
	);

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

	const finishRef = useRef<() => void>(() => {});

	useDrawMapEvents({
		map,
		isLoaded,
		mode,
		modeRef,
		cursorRef,
		repaint,
		applyPart,
		finishRef,
		setMode,
		setVertices,
	});

	const start = useCallback(
		(type: DrawGeometryType) => {
			// Starting a fresh draw clears every committed part, at any part count, so
			// the map shows exactly what the in-progress shape will become.
			rejectPending(modeRef.current);
			cursorRef.current = null;
			setVertices([]);
			highlightPart(null);
			onChangeRef.current(null);
			setMode({ kind: 'draw', type, target: 'replace' });
		},
		[highlightPart],
	);

	const cancel = useCallback(() => {
		rejectPending(modeRef.current);
		cursorRef.current = null;
		setVertices([]);
		setMode({ kind: 'idle' });
	}, []);

	const commit = useCallback((geometry: DrawGeometry | null) => {
		rejectPending(modeRef.current);
		cursorRef.current = null;
		setVertices([]);
		onChangeRef.current(geometry);
		setMode({ kind: 'idle' });
	}, []);

	const undo = useCallback(() => {
		setVertices((previous) => previous.slice(0, -1));
	}, []);

	const finish = useCallback(() => {
		const current = modeRef.current;
		if (current.kind !== 'draw' || current.type === 'Point') {
			return;
		}
		const part = partFromVertices(current.type, dedupeTrailing(verticesRef.current));
		if (part === null) {
			return;
		}
		applyPart(current.target, part);
	}, [applyPart]);
	finishRef.current = finish;

	const requestPoint = useCallback(
		(_prompt?: string) =>
			new Promise<DrawGeometry & { readonly type: 'Point' }>((resolve, reject) => {
				if (!isMapLive(map)) {
					reject(new Error('The map is not ready yet.'));
					return;
				}
				rejectPending(modeRef.current);
				cursorRef.current = null;
				setVertices([]);
				setMode({ kind: 'point', resolve, reject });
			}),
		[map],
	);

	const drawType = mode.kind === 'draw' ? mode.type : null;
	const canFinish =
		mode.kind === 'draw' && partFromVertices(mode.type, dedupeTrailing(vertices)) !== null;

	return {
		isDrawing: mode.kind === 'draw',
		isAddingPart: mode.kind === 'draw' && mode.target === 'part',
		isRequestingPoint: mode.kind === 'point',
		drawType,
		vertexCount: vertices.length,
		canFinish,
		start,
		startPart,
		removePart,
		highlightPart,
		zoomToPart,
		finish,
		cancel,
		undo,
		commit,
		requestPoint,
	};
}

/**
 * Ease the map to frame `geometry`.
 *
 * A single position has no extent to fit, so it eases to centre instead and
 * keeps the zoom it is already at when that is closer in than 15.
 */
export function fitMapToGeometry(map: MapboxMap, geometry: GeoJsonGeometry): void {
	const bounds = boundsFromGeoJson(geometry);
	if (bounds === null) {
		return;
	}
	const hasArea = bounds.west !== bounds.east || bounds.south !== bounds.north;
	if (hasArea) {
		map.fitBounds(
			[
				[bounds.west, bounds.south],
				[bounds.east, bounds.north],
			],
			{ padding: 80, maxZoom: 17, duration: 600 },
		);
		return;
	}
	map.easeTo({ center: [bounds.west, bounds.south], zoom: Math.max(map.getZoom(), 15) });
}

/**
 * Everything that acts on the committed parts: adding one, dropping one, and
 * picking one out on the map.
 *
 * A hook of its own because the four of them share one piece of state, the
 * highlighted index, and because the controller they hang off is already the
 * widest thing in this file.
 */
function useDrawPartActions({
	map,
	cursorRef,
	modeRef,
	valueRef,
	onChangeRef,
	setMode,
	setVertices,
}: {
	readonly map: MapboxMap | null;
	readonly cursorRef: { current: Position | null };
	readonly modeRef: { current: Mode };
	readonly valueRef: { current: DrawGeometry | null };
	readonly onChangeRef: { current: (value: DrawGeometry | null) => void };
	readonly setMode: (next: Mode) => void;
	readonly setVertices: (next: readonly Position[]) => void;
}) {
	const [highlightedPart, setHighlightedPart] = useState<number | null>(null);
	const highlightedRef = useRef(highlightedPart);
	highlightedRef.current = highlightedPart;

	// The one place a finished draw lands. `replace` throws the committed parts
	// away, `part` appends to them, and the shape that comes out is whatever
	// `geometryFromParts` says the count makes it.
	const applyPart = useCallback(
		(target: DrawTarget, part: DrawPartGeometry) => {
			const existing = target === 'part' ? drawParts(valueRef.current) : [];
			cursorRef.current = null;
			setVertices([]);
			setMode({ kind: 'idle' });
			onChangeRef.current(geometryFromParts([...existing, part]));
		},
		[cursorRef, valueRef, onChangeRef, setMode, setVertices],
	);

	// The base shape comes off the committed parts rather than off the toggle:
	// they are the thing being added to, and a toggle change has already cleared
	// them.
	const startPart = useCallback(() => {
		const base = drawParts(valueRef.current)[0]?.type;
		if (base === undefined) {
			return;
		}
		rejectPending(modeRef.current);
		cursorRef.current = null;
		setVertices([]);
		setHighlightedPart(null);
		setMode({ kind: 'draw', type: base, target: 'part' });
	}, [cursorRef, modeRef, valueRef, setMode, setVertices]);

	const removePart = useCallback(
		(index: number) => {
			setHighlightedPart(null);
			onChangeRef.current(
				geometryFromParts(drawParts(valueRef.current).filter((_, at) => at !== index)),
			);
		},
		[valueRef, onChangeRef],
	);

	const zoomToPart = useCallback(
		(index: number) => {
			const part = drawParts(valueRef.current)[index];
			if (part === undefined || !isMapLive(map)) {
				return;
			}
			fitMapToGeometry(map, part as unknown as GeoJsonGeometry);
		},
		[map, valueRef],
	);

	return {
		applyPart,
		highlightedPart,
		highlightedRef,
		highlightPart: setHighlightedPart,
		removePart,
		startPart,
		zoomToPart,
	};
}

/**
 * Map and keyboard wiring, live only while a mode needs it.
 *
 * Its own hook because an idle map should carry no extra click, move or key
 * listener, and because the cursor and the double-click zoom it takes over have
 * to be handed back on every exit, including the one where the map has already
 * been removed.
 */
function useDrawMapEvents({
	map,
	isLoaded,
	mode,
	modeRef,
	cursorRef,
	repaint,
	applyPart,
	finishRef,
	setMode,
	setVertices,
}: {
	readonly map: MapboxMap | null;
	readonly isLoaded: boolean;
	readonly mode: Mode;
	readonly modeRef: { current: Mode };
	readonly cursorRef: { current: Position | null };
	readonly repaint: () => void;
	readonly applyPart: (target: DrawTarget, part: DrawPartGeometry) => void;
	readonly finishRef: { current: () => void };
	readonly setMode: (next: Mode) => void;
	readonly setVertices: (
		next: readonly Position[] | ((previous: readonly Position[]) => readonly Position[]),
	) => void;
}): void {
	useEffect(() => {
		if (!isMapLive(map) || !isLoaded || mode.kind === 'idle') {
			return;
		}
		const activeMap = map;
		const canvas = activeMap.getCanvas();
		const previousCursor = canvas.style.cursor;
		canvas.style.cursor = 'crosshair';
		const doubleClickZoomWasEnabled = activeMap.doubleClickZoom.isEnabled();
		activeMap.doubleClickZoom.disable();

		function handleClick(event: MapMouseEvent) {
			const current = modeRef.current;
			const position: Position = [event.lngLat.lng, event.lngLat.lat];
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
				applyPart(current.target, { type: 'Point', coordinates: position });
				return;
			}
			setVertices((previous) => [...previous, position]);
		}

		function handleMove(event: MapMouseEvent) {
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

		function handleKeyDown(event: KeyboardEvent) {
			if (event.key === 'Enter') {
				finishRef.current();
				return;
			}
			if (event.key !== 'Escape') {
				return;
			}
			const current = modeRef.current;
			if (current.kind === 'point') {
				current.reject(new Error('Point selection cancelled.'));
			}
			cursorRef.current = null;
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
		repaint,
		applyPart,
		finishRef,
		setMode,
		setVertices,
	]);
}

/** Whether the cursor is trailing a segment, which only a line or an area does. */
function isRubberBanding(mode: Mode): boolean {
	return mode.kind === 'draw' && mode.type !== 'Point';
}

function rejectPending(mode: Mode): void {
	if (mode.kind === 'point') {
		mode.reject(new Error('A new map request replaced this one.'));
	}
}

/**
 * Every committed part, plus the part being drawn over the top of them.
 *
 * The committed parts stay on the map through an add so the user places the new
 * one against what is already there. A replace has already cleared them, so the
 * same code covers both.
 */
function buildFeatures({
	committed,
	mode,
	vertices,
	cursor,
	highlighted,
}: {
	readonly committed: DrawGeometry | null;
	readonly mode: Mode;
	readonly vertices: readonly Position[];
	readonly cursor: Position | null;
	readonly highlighted: number | null;
}): GeoJSON.FeatureCollection {
	const features: GeoJSON.Feature[] = [];
	drawParts(committed).forEach((part, index) => {
		features.push(...partFeatures(part, index === highlighted));
	});

	if (mode.kind === 'draw' && mode.type !== 'Point') {
		const preview = cursor === null ? vertices : [...vertices, cursor];
		if (mode.type === 'Polygon' && preview.length >= 3) {
			features.push(geometryFeature({ type: 'Polygon', coordinates: [closeRing(preview)] }));
		} else if (preview.length >= 2) {
			features.push(geometryFeature({ type: 'LineString', coordinates: preview }));
		}
		for (const vertex of vertices) {
			features.push(pointFeature(vertex, 'vertex'));
		}
	}

	return features.length === 0 ? EMPTY : { type: 'FeatureCollection', features };
}

function partFeatures(part: DrawPartGeometry, highlighted: boolean): GeoJSON.Feature[] {
	if (part.type === 'Point') {
		return [pointFeature(part.coordinates, 'point', highlighted)];
	}
	if (part.type === 'LineString') {
		return [
			geometryFeature(part, highlighted),
			...part.coordinates.map((position) => pointFeature(position, 'vertex', highlighted)),
		];
	}
	// The ring is closed, so the repeated first position is not drawn twice.
	const ring = part.coordinates[0] ?? [];
	return [
		geometryFeature(part, highlighted),
		...ring.slice(0, -1).map((position) => pointFeature(position, 'vertex', highlighted)),
	];
}

function geometryFeature(geometry: DrawGeometry, highlighted = false): GeoJSON.Feature {
	return {
		type: 'Feature',
		properties: { highlighted },
		geometry: geometry as unknown as GeoJSON.Geometry,
	};
}

function pointFeature(
	position: Position,
	role: 'vertex' | 'point',
	highlighted = false,
): GeoJSON.Feature {
	return {
		type: 'Feature',
		properties: { role, highlighted },
		geometry: { type: 'Point', coordinates: [position[0], position[1]] },
	};
}

/**
 * The part the drawn vertices make, or `null` while there is not one yet.
 *
 * `canFinish` reads this too, so the covers-ground rule runs here rather than
 * beside the button: Finish would otherwise promise a write the server answers
 * 400. Three clicks in one spot passed `vertices.length < 3` and finished a
 * zero-area Polygon.
 */
function partFromVertices(
	type: DrawGeometryType,
	vertices: readonly Position[],
): DrawPartGeometry | null {
	const part = shapeFromVertices(type, vertices);
	return part !== null && geometryCoversGround(part) ? part : null;
}

function shapeFromVertices(
	type: DrawGeometryType,
	vertices: readonly Position[],
): DrawPartGeometry | null {
	if (type === 'Point') {
		const point = vertices[0];
		return point === undefined ? null : { type: 'Point', coordinates: point };
	}
	if (type === 'LineString') {
		return vertices.length < 2 ? null : { type: 'LineString', coordinates: vertices };
	}
	return vertices.length < 3 ? null : { type: 'Polygon', coordinates: [closeRing(vertices)] };
}

function closeRing(vertices: readonly Position[]): readonly Position[] {
	const first = vertices[0];
	const last = vertices.at(-1);
	if (first === undefined || last === undefined) {
		return vertices;
	}
	return first[0] === last[0] && first[1] === last[1] ? vertices : [...vertices, first];
}

// A double-click to finish lands as two near-identical clicks; drop a trailing
// vertex that duplicates the one before it so the saved shape has no zero-length
// final segment.
function dedupeTrailing(vertices: readonly Position[]): readonly Position[] {
	if (vertices.length < 2) {
		return vertices;
	}
	const last = vertices[vertices.length - 1];
	const previous = vertices[vertices.length - 2];
	if (last !== undefined && previous !== undefined && samePosition(last, previous)) {
		return vertices.slice(0, -1);
	}
	return vertices;
}

function samePosition(first: Position, second: Position): boolean {
	return Math.abs(first[0] - second[0]) < 1e-9 && Math.abs(first[1] - second[1]) < 1e-9;
}
