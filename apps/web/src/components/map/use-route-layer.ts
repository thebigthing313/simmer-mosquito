import { mapProgress } from '@simmer-mosquito/design-tokens';
import type { GeoJsonGeometry } from '@simmer-mosquito/mapping';
import type {
	CircleLayerSpecification,
	ExpressionSpecification,
	FillLayerSpecification,
	LineLayerSpecification,
	Map as MapboxMap,
	MapMouseEvent,
	SymbolLayerSpecification,
} from 'mapbox-gl';
import { useEffect, useMemo, useRef } from 'react';
import { useGeoJsonSource } from './use-geojson-source';
import { isMapLive } from './use-mapbox-map';

/**
 * One ordered stop on a route map — a numbered pin the layer draws and, in
 * sequence, threads a connecting path through. Framework-free geometry so the
 * hook stays decoupled from the route domain rows that produce it.
 */
export interface RouteStopFeature {
	readonly id: string;
	readonly lng: number;
	readonly lat: number;
	/** 1-indexed position along the route; rendered inside the pin. */
	readonly ordinal: number;
	/**
	 * The stop's real shape, when it owns one.
	 *
	 * A mission stop can be a whole ditch run or a treated block, not just a
	 * dropped pin, and drawing it as a dot is a lie about where the crew is
	 * going. Where this is set to a line or an area it is drawn beneath the
	 * numbered pin, which stays as the ordinal marker — a polygon has nowhere to
	 * put a number, and the sequence is the reason the map exists.
	 *
	 * Omit it for stops that point at another record (a route's traps, an
	 * assignment's habitats): those are located *by* that record, and its own
	 * shape belongs to its own layer.
	 */
	readonly geometry?: GeoJsonGeometry | null | undefined;
	/**
	 * Drives the pin fill so status reads without a legend.
	 *
	 * Two vocabularies share the union because two kinds of ordered list share
	 * this layer. A route's stops report the *site* — retired, inaccessible — and
	 * a worklist's stops report the *work* — done, skipped. A caller picks one
	 * family; nothing here forces it, because a route has no notion of a stop
	 * being done and an assignment has no notion of one being retired.
	 */
	readonly tone: 'default' | 'inactive' | 'inaccessible' | 'done' | 'skipped';
}

export interface RouteLayerConfig {
	readonly stops: readonly RouteStopFeature[];
	/** The committed selection; its pin wears the emphasis ring. */
	readonly selectedId?: string | null | undefined;
	/** A transient highlight (e.g. the list row under the cursor). */
	readonly highlightId?: string | null | undefined;
	/** Fired with a stop id on pin click, or null when clicking empty map. */
	readonly onSelectStop?: ((id: string | null) => void) | undefined;
	/** Fired with a stop id on pin hover, or null when the cursor leaves. */
	readonly onHoverStop?: ((id: string | null) => void) | undefined;
}

const SOURCE_ID = 'route-sites';
const PATH_LAYER_ID = 'route-sites-path';
const SHAPE_FILL_LAYER_ID = 'route-sites-shape-fill';
const SHAPE_LINE_LAYER_ID = 'route-sites-shape-line';
const STOP_LAYER_ID = 'route-sites-stop';
const LABEL_LAYER_ID = 'route-sites-label';
const PATH_FEATURE_ID = '__route_path__';

/** A shape feature's own id — distinct from its stop's, which owns the pin. */
function shapeFeatureId(stopId: string): string {
	return `${stopId}__shape`;
}

// Order matters: the connecting path and the shapes sit under the pins, and the
// label sits over everything.
/** Layers a click or hover may land on, pins first so a pin inside its own area wins. */
const INTERACTIVE_LAYER_IDS = [STOP_LAYER_ID, SHAPE_FILL_LAYER_ID, SHAPE_LINE_LAYER_ID] as const;

/** Field-room palette; kept in hex because GL paint can't read CSS tokens. */
const colors = {
	path: '#0c5331',
	stop: '#0c5331',
	stopInactive: '#8a9a93',
	stopInaccessible: '#e5484d',
	// The progress tones come from the shared palette rather than two more local
	// hexes; the four above predate it and are left alone so restyling the route
	// map stays its own change.
	stopDone: mapProgress.done,
	stopSkipped: mapProgress.skipped,
	stroke: '#f9fdfb',
	ring: '#e4c04a',
	label: '#f9fdfb',
} as const;

const emphasized: ExpressionSpecification = [
	'any',
	['boolean', ['feature-state', 'selected'], false],
	['boolean', ['feature-state', 'highlight'], false],
];

const toneColor: ExpressionSpecification = [
	'match',
	['get', 'tone'],
	'inaccessible',
	colors.stopInaccessible,
	'inactive',
	colors.stopInactive,
	'done',
	colors.stopDone,
	'skipped',
	colors.stopSkipped,
	colors.stop,
];

function routeLayers(): [
	LineLayerSpecification,
	FillLayerSpecification,
	LineLayerSpecification,
	CircleLayerSpecification,
	SymbolLayerSpecification,
] {
	return [
		{
			id: PATH_LAYER_ID,
			type: 'line',
			source: SOURCE_ID,
			filter: ['==', ['get', 'kind'], 'path'],
			layout: { 'line-cap': 'round', 'line-join': 'round' },
			paint: {
				'line-color': colors.path,
				'line-width': 2.5,
				'line-opacity': 0.55,
				'line-dasharray': [1.5, 1.2],
			},
		},
		{
			id: SHAPE_FILL_LAYER_ID,
			type: 'fill',
			source: SOURCE_ID,
			filter: ['==', ['get', 'kind'], 'shape'],
			paint: {
				'fill-color': toneColor,
				// Light enough that overlapping stops on the same block stay legible,
				// and that the basemap underneath still reads.
				'fill-opacity': ['case', emphasized, 0.32, 0.16],
			},
		},
		{
			id: SHAPE_LINE_LAYER_ID,
			type: 'line',
			source: SOURCE_ID,
			filter: ['==', ['get', 'kind'], 'shape'],
			layout: { 'line-cap': 'round', 'line-join': 'round' },
			paint: {
				'line-color': toneColor,
				'line-width': ['case', emphasized, 4, 2.5],
				'line-opacity': 0.9,
			},
		},
		{
			id: STOP_LAYER_ID,
			type: 'circle',
			source: SOURCE_ID,
			filter: ['==', ['get', 'kind'], 'stop'],
			paint: {
				'circle-radius': ['case', emphasized, 14, 12],
				'circle-color': toneColor,
				'circle-stroke-color': ['case', emphasized, colors.ring, colors.stroke],
				'circle-stroke-width': ['case', emphasized, 3.5, 2],
			},
		},
		{
			id: LABEL_LAYER_ID,
			type: 'symbol',
			source: SOURCE_ID,
			filter: ['==', ['get', 'kind'], 'stop'],
			layout: {
				'text-field': ['to-string', ['get', 'ordinal']],
				'text-font': ['DIN Pro Bold', 'Arial Unicode MS Bold'],
				'text-size': 11,
				'text-allow-overlap': true,
				'text-ignore-placement': true,
			},
			paint: { 'text-color': colors.label },
		},
	];
}

function buildData(stops: readonly RouteStopFeature[]): GeoJSON.FeatureCollection {
	const located = stops.filter((stop) => Number.isFinite(stop.lng) && Number.isFinite(stop.lat));

	const points: GeoJSON.Feature[] = located.map((stop) => ({
		type: 'Feature',
		id: stop.id,
		geometry: { type: 'Point', coordinates: [stop.lng, stop.lat] },
		properties: { id: stop.id, kind: 'stop', ordinal: stop.ordinal, tone: stop.tone },
	}));

	// A stop whose own shape is a point already has one — the pin. Only lines and
	// areas add a feature, and they carry the *stop's* id in `properties` so a
	// click on the area selects the stop, not the shape.
	const shapes: GeoJSON.Feature[] = located
		.filter((stop) => isDrawableShape(stop.geometry))
		.map((stop) => ({
			type: 'Feature',
			id: shapeFeatureId(stop.id),
			geometry: stop.geometry as unknown as GeoJSON.Geometry,
			properties: { id: stop.id, kind: 'shape', ordinal: stop.ordinal, tone: stop.tone },
		}));

	const line =
		points.length >= 2
			? [
					{
						type: 'Feature' as const,
						id: PATH_FEATURE_ID,
						geometry: {
							type: 'LineString' as const,
							coordinates: points.map((point) => (point.geometry as GeoJSON.Point).coordinates),
						},
						properties: { kind: 'path' },
					},
				]
			: [];

	return { type: 'FeatureCollection', features: [...line, ...shapes, ...points] };
}

/** Anything but a bare point, which the numbered pin already draws. */
function isDrawableShape(geometry: GeoJsonGeometry | null | undefined): boolean {
	return geometry != null && geometry.type !== 'Point';
}

/** A stable signature so we only re-push data when the ordered stop set changes. */
function stopsSignature(stops: readonly RouteStopFeature[]): string {
	return stops
		.map(
			(stop) =>
				`${stop.id}:${stop.ordinal}:${stop.tone}:${stop.lng.toFixed(6)},${stop.lat.toFixed(6)}:${shapeSignature(stop.geometry)}`,
		)
		.join('|');
}

/**
 * A shape's contribution to the signature.
 *
 * Its type and vertex count, not its coordinates: a stop's shape is replaced
 * wholesale when it is redrawn, so two shapes of the same type and size at the
 * same centroid are the same shape in practice — and stringifying every ring of
 * every polygon on every render to find that out is not worth the certainty.
 */
function shapeSignature(geometry: GeoJsonGeometry | null | undefined): string {
	if (!isDrawableShape(geometry)) {
		return '-';
	}
	const shape = geometry as { readonly type: string; readonly coordinates?: unknown };
	return `${shape.type}:${JSON.stringify(shape.coordinates).length}`;
}

/**
 * Push selection and hover onto the pin and, where there is one, the shape.
 *
 * They are two features with two ids — the pin is keyed by the stop's id so the
 * caller's selection maps straight onto it, and the shape needs its own or the
 * source would hold two features under one key — so emphasis has to be written
 * to both or an area would stay pale while its pin lit up.
 */
function emphasizeStops(
	map: MapboxMap,
	stops: readonly RouteStopFeature[],
	selectedId: string | null,
	highlightId: string | null,
): void {
	for (const stop of stops) {
		const state = {
			selected: stop.id === selectedId,
			highlight: stop.id === highlightId,
		};
		map.setFeatureState({ source: SOURCE_ID, id: stop.id }, state);
		if (isDrawableShape(stop.geometry)) {
			map.setFeatureState({ source: SOURCE_ID, id: shapeFeatureId(stop.id) }, state);
		}
	}
}

/**
 * Draws an ordered route on a live Mapbox map: a dashed connecting path plus
 * numbered stop pins, with click and hover routed back out and a two-way
 * selected/highlight emphasis driven through feature-state (so selection and
 * cursor sync between the list and the map without rebuilding the source).
 * No-ops when `config` is undefined. The source lifetime — including putting
 * feature-state back after a basemap switch — is {@link useGeoJsonSource}'s.
 */
export function useRouteLayer(
	map: MapboxMap | null,
	isLoaded: boolean,
	config: RouteLayerConfig | undefined,
): void {
	const enabled = config !== undefined;
	const stops = config?.stops ?? [];
	const signature = enabled ? stopsSignature(stops) : '';
	const selectedId = config?.selectedId ?? null;
	const highlightId = config?.highlightId ?? null;

	const stopsRef = useRef(stops);
	stopsRef.current = stops;
	const onSelectRef = useRef(config?.onSelectStop);
	onSelectRef.current = config?.onSelectStop;
	const onHoverRef = useRef(config?.onHoverStop);
	onHoverRef.current = config?.onHoverStop;
	const selectedRef = useRef(selectedId);
	const highlightRef = useRef(highlightId);

	// The stop set as one value, rebuilt only when the signature says the stops
	// actually changed — the primitive pushes a new `data` identity through
	// `setData`, and an unmemoized build would do that on every render.
	// biome-ignore lint/correctness/useExhaustiveDependencies: signature is the change key for the ref-read stops.
	const data = useMemo(() => (enabled ? buildData(stopsRef.current) : null), [enabled, signature]);

	useGeoJsonSource({
		map,
		isLoaded,
		sourceId: SOURCE_ID,
		data,
		layers: routeLayers,
		// Feature-state needs a stable feature id, which Mapbox will not take from
		// a GeoJSON string id on its own.
		sourceOptions: { promoteId: 'id' },
		// A restyle wipes feature-state along with the layers, so the emphasis has
		// to be re-applied every time the source is re-established.
		onEnsure: () => {
			if (map !== null) {
				emphasizeStops(map, stopsRef.current, selectedRef.current, highlightRef.current);
			}
		},
	});

	// Click and hover are this hook's own: a stop's shape is as clickable as its
	// pin, a miss must not clear the selection, and the hover id is reported back
	// so the list and the map can highlight together.
	useEffect(() => {
		if (!isMapLive(map) || !isLoaded || !enabled) {
			return;
		}
		const activeMap = map;

		function stopAt(event: MapMouseEvent): string | null {
			// The stop id rides in `properties`, because the shape feature carries a
			// feature id of its own.
			const layers = INTERACTIVE_LAYER_IDS.filter(
				(layerId) => activeMap.getLayer(layerId) !== undefined,
			);
			if (layers.length === 0) {
				return null;
			}
			const id = activeMap.queryRenderedFeatures(event.point, { layers })[0]?.properties?.id;
			return typeof id === 'string' ? id : null;
		}

		function handleClick(event: MapMouseEvent) {
			const id = stopAt(event);
			if (id !== null) {
				onSelectRef.current?.(id);
			}
		}

		function handleMove(event: MapMouseEvent) {
			const id = stopAt(event);
			activeMap.getCanvas().style.cursor = id === null ? '' : 'pointer';
			onHoverRef.current?.(id);
		}

		activeMap.on('click', handleClick);
		activeMap.on('mousemove', handleMove);

		return () => {
			activeMap.off('click', handleClick);
			activeMap.off('mousemove', handleMove);
			try {
				activeMap.getCanvas().style.cursor = '';
			} catch {
				// Map already removed; nothing left to reset.
			}
		};
	}, [map, isLoaded, enabled]);

	// Keep the selected + highlighted pins in sync via feature-state only.
	// biome-ignore lint/correctness/useExhaustiveDependencies: signature re-applies state to a changed stop set.
	useEffect(() => {
		selectedRef.current = selectedId;
		highlightRef.current = highlightId;
		if (!isMapLive(map) || !isLoaded || !enabled || map.getSource(SOURCE_ID) === undefined) {
			return;
		}
		emphasizeStops(map, stopsRef.current, selectedId, highlightId);
	}, [map, isLoaded, enabled, selectedId, highlightId, signature]);
}
