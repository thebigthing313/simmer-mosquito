import { mapInteraction } from '@simmer-mosquito/design-tokens';
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

/**
 * A geometry the habitat draw flow can produce. Mirrors the GeoJSON shape the
 * habitat command's `locationSource.geometry` expects, so a finished draft can
 * be handed straight to the optimistic mutation without translation.
 */
export type DrawGeometryType = 'Point' | 'LineString' | 'Polygon';

export type DrawGeometry =
	| { readonly type: 'Point'; readonly coordinates: readonly [number, number] }
	| { readonly type: 'LineString'; readonly coordinates: readonly (readonly [number, number])[] }
	| {
			readonly type: 'Polygon';
			readonly coordinates: readonly (readonly (readonly [number, number])[])[];
	  };

type Position = readonly [number, number];

/**
 * The draw controller surface the form panel and the on-map toolbar both drive.
 * `start` is wired to the form's "Draw geometry" button; `finish`/`cancel`/`undo`
 * live on the floating map toolbar so the user exits draw mode from the map.
 */
export interface MapDrawController {
	readonly isDrawing: boolean;
	readonly isRequestingPoint: boolean;
	readonly drawType: DrawGeometryType | null;
	readonly vertexCount: number;
	readonly canFinish: boolean;
	readonly start: (type: DrawGeometryType) => void;
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
			paint: { 'fill-color': draft.fill, 'fill-opacity': 0.18 },
		},
		{
			id: `${SOURCE_ID}-outline`,
			type: 'line',
			source: SOURCE_ID,
			filter: isPolygon,
			layout: { 'line-join': 'round' },
			paint: { 'line-color': draft.outline, 'line-width': 2.5 },
		},
		{
			id: `${SOURCE_ID}-line`,
			type: 'line',
			source: SOURCE_ID,
			filter: isLine,
			layout: { 'line-join': 'round', 'line-cap': 'round' },
			paint: { 'line-color': draft.line, 'line-width': 3, 'line-dasharray': [2, 1] },
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
				'circle-radius': 8,
				'circle-stroke-color': draft.pointStroke,
				'circle-stroke-width': 3,
			},
		},
	];
}

const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

type Mode =
	| { readonly kind: 'idle' }
	| { readonly kind: 'draw'; readonly type: DrawGeometryType }
	| {
			readonly kind: 'point';
			readonly resolve: (point: DrawGeometry & { readonly type: 'Point' }) => void;
			readonly reject: (error: Error) => void;
	  };

/**
 * Binds a draft-geometry source + layers to a live map and runs a small draw
 * state machine over map clicks. Renders the committed `value` when idle, and a
 * live preview (placed vertices + a rubber-band segment to the cursor) while
 * drawing. Point finishes on the first click; line/polygon collect vertices
 * until the caller finishes from the map toolbar (or double-click / Enter).
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
			}),
		);
	}, [map]);

	// What the draft source holds after a real state change — a new committed
	// value, another vertex, a mode switch. The cursor is deliberately not a
	// dependency: it moves every frame and rides `repaint` instead, so a
	// mousemove repaints the rubber band without re-rendering anything.
	const features = useMemo(
		() => buildFeatures({ committed: value, mode, vertices, cursor: cursorRef.current }),
		[value, mode, vertices],
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

	// Interaction wiring is active only while a mode needs the map. Keeping it in
	// its own effect (keyed on the mode kind/type) means idle maps carry no extra
	// click/move/key listeners and the cursor is always restored on exit.
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
			if (current.type === 'Point') {
				onChangeRef.current({ type: 'Point', coordinates: position });
				setVertices([]);
				cursorRef.current = null;
				setMode({ kind: 'idle' });
				return;
			}
			setVertices((previous) => [...previous, position]);
		}

		function handleMove(event: MapMouseEvent) {
			canvas.style.cursor = 'crosshair';
			if (modeRef.current.kind === 'draw' && modeRef.current.type !== 'Point') {
				cursorRef.current = [event.lngLat.lng, event.lngLat.lat];
				repaint();
			}
		}

		function handleDoubleClick(event: MapMouseEvent) {
			if (modeRef.current.kind === 'draw' && modeRef.current.type !== 'Point') {
				event.preventDefault();
				finishRef.current();
			}
		}

		function handleKeyDown(event: KeyboardEvent) {
			if (event.key === 'Escape') {
				const current = modeRef.current;
				if (current.kind === 'point') {
					current.reject(new Error('Point selection cancelled.'));
				}
				cursorRef.current = null;
				setVertices([]);
				setMode({ kind: 'idle' });
			} else if (event.key === 'Enter') {
				finishRef.current();
			}
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
	}, [map, isLoaded, mode, repaint]);

	const start = useCallback((type: DrawGeometryType) => {
		// Starting a fresh draw clears any prior committed geometry so the map
		// shows exactly what the in-progress shape will become.
		rejectPending(modeRef.current);
		cursorRef.current = null;
		setVertices([]);
		onChangeRef.current(null);
		setMode({ kind: 'draw', type });
	}, []);

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
		const cleaned = dedupeTrailing(verticesRef.current);
		const geometry = geometryFromVertices(current.type, cleaned);
		if (geometry === null) {
			return;
		}
		cursorRef.current = null;
		setVertices([]);
		onChangeRef.current(geometry);
		setMode({ kind: 'idle' });
	}, []);
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
		mode.kind === 'draw' && geometryFromVertices(mode.type, dedupeTrailing(vertices)) !== null;

	return {
		isDrawing: mode.kind === 'draw',
		isRequestingPoint: mode.kind === 'point',
		drawType,
		vertexCount: vertices.length,
		canFinish,
		start,
		finish,
		cancel,
		undo,
		commit,
		requestPoint,
	};
}

function rejectPending(mode: Mode): void {
	if (mode.kind === 'point') {
		mode.reject(new Error('A new map request replaced this one.'));
	}
}

function buildFeatures({
	committed,
	mode,
	vertices,
	cursor,
}: {
	readonly committed: DrawGeometry | null;
	readonly mode: Mode;
	readonly vertices: readonly Position[];
	readonly cursor: Position | null;
}): GeoJSON.FeatureCollection {
	if (mode.kind === 'draw' && mode.type !== 'Point') {
		const features: GeoJSON.Feature[] = [];
		const preview = cursor === null ? vertices : [...vertices, cursor];
		if (mode.type === 'Polygon' && preview.length >= 3) {
			features.push(geometryFeature({ type: 'Polygon', coordinates: [closeRing(preview)] }));
		} else if (preview.length >= 2) {
			features.push(geometryFeature({ type: 'LineString', coordinates: preview }));
		}
		for (const vertex of vertices) {
			features.push(pointFeature(vertex, 'vertex'));
		}
		return { type: 'FeatureCollection', features };
	}

	if (committed === null) {
		return EMPTY;
	}
	return { type: 'FeatureCollection', features: committedFeatures(committed) };
}

function committedFeatures(geometry: DrawGeometry): GeoJSON.Feature[] {
	if (geometry.type === 'Point') {
		return [pointFeature(geometry.coordinates, 'point')];
	}
	if (geometry.type === 'LineString') {
		return [
			geometryFeature(geometry),
			...geometry.coordinates.map((position) => pointFeature(position, 'vertex')),
		];
	}
	const ring = geometry.coordinates[0] ?? [];
	return [
		geometryFeature(geometry),
		...ring.slice(0, -1).map((position) => pointFeature(position, 'vertex')),
	];
}

function geometryFeature(geometry: DrawGeometry): GeoJSON.Feature {
	return {
		type: 'Feature',
		properties: {},
		geometry: geometry as unknown as GeoJSON.Geometry,
	};
}

function pointFeature(position: Position, role: 'vertex' | 'point'): GeoJSON.Feature {
	return {
		type: 'Feature',
		properties: { role },
		geometry: { type: 'Point', coordinates: [position[0], position[1]] },
	};
}

function geometryFromVertices(
	type: DrawGeometryType,
	vertices: readonly Position[],
): DrawGeometry | null {
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
