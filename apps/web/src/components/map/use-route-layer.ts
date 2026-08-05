import { mapProgress } from '@simmer-mosquito/design-tokens';
import type {
	CircleLayerSpecification,
	ExpressionSpecification,
	GeoJSONSource,
	LineLayerSpecification,
	Map as MapboxMap,
	MapMouseEvent,
	SymbolLayerSpecification,
} from 'mapbox-gl';
import { useEffect, useRef } from 'react';

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
const STOP_LAYER_ID = 'route-sites-stop';
const LABEL_LAYER_ID = 'route-sites-label';
const PATH_FEATURE_ID = '__route_path__';

const LAYER_IDS = [PATH_LAYER_ID, STOP_LAYER_ID, LABEL_LAYER_ID] as const;

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
	const points: GeoJSON.Feature[] = stops
		.filter((stop) => Number.isFinite(stop.lng) && Number.isFinite(stop.lat))
		.map((stop) => ({
			type: 'Feature',
			id: stop.id,
			geometry: { type: 'Point', coordinates: [stop.lng, stop.lat] },
			properties: { id: stop.id, kind: 'stop', ordinal: stop.ordinal, tone: stop.tone },
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

	return { type: 'FeatureCollection', features: [...line, ...points] };
}

/** A stable signature so we only re-push data when the ordered stop set changes. */
function stopsSignature(stops: readonly RouteStopFeature[]): string {
	return stops
		.map(
			(stop) =>
				`${stop.id}:${stop.ordinal}:${stop.tone}:${stop.lng.toFixed(6)},${stop.lat.toFixed(6)}`,
		)
		.join('|');
}

/**
 * Draws an ordered route on a live Mapbox map: a dashed connecting path plus
 * numbered stop pins, with click and hover routed back out and a two-way
 * selected/highlight emphasis driven through feature-state (so selection and
 * cursor sync between the list and the map without rebuilding the source).
 * Mirrors {@link useHabitatTileLayer}: re-adds on basemap restyle, guards
 * teardown against an already-removed map, and no-ops when `config` is undefined.
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

	// Source + layers + interaction. Re-runs only on map identity / load / enable.
	useEffect(() => {
		if (map === null || !isLoaded || !enabled) {
			return;
		}
		const activeMap = map;

		function applyFeatureStates() {
			for (const stop of stopsRef.current) {
				activeMap.setFeatureState(
					{ source: SOURCE_ID, id: stop.id },
					{
						selected: stop.id === selectedRef.current,
						highlight: stop.id === highlightRef.current,
					},
				);
			}
		}

		function ensureLayers() {
			if (activeMap.getSource(SOURCE_ID) === undefined) {
				activeMap.addSource(SOURCE_ID, {
					type: 'geojson',
					data: buildData(stopsRef.current),
					promoteId: 'id',
				});
			}
			for (const layer of routeLayers()) {
				if (activeMap.getLayer(layer.id) === undefined) {
					activeMap.addLayer(layer);
				}
			}
			applyFeatureStates();
		}

		ensureLayers();
		// setStyle (basemap switch) wipes custom sources/layers + feature-state.
		activeMap.on('style.load', ensureLayers);

		function stopAt(event: MapMouseEvent): string | null {
			if (activeMap.getLayer(STOP_LAYER_ID) === undefined) {
				return null;
			}
			const feature = activeMap.queryRenderedFeatures(event.point, { layers: [STOP_LAYER_ID] })[0];
			return feature === undefined || feature.id === undefined ? null : String(feature.id);
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
			activeMap.off('style.load', ensureLayers);
			activeMap.off('click', handleClick);
			activeMap.off('mousemove', handleMove);
			try {
				activeMap.getCanvas().style.cursor = '';
				for (const id of LAYER_IDS) {
					if (activeMap.getLayer(id) !== undefined) {
						activeMap.removeLayer(id);
					}
				}
				if (activeMap.getSource(SOURCE_ID) !== undefined) {
					activeMap.removeSource(SOURCE_ID);
				}
			} catch {
				// Map already removed; nothing left to clean up.
			}
		};
	}, [map, isLoaded, enabled]);

	// Push the ordered stop set onto the existing source when it changes.
	// biome-ignore lint/correctness/useExhaustiveDependencies: signature is the change key for the ref-read stops.
	useEffect(() => {
		if (map === null || !isLoaded || !enabled) {
			return;
		}
		const source = map.getSource(SOURCE_ID) as GeoJSONSource | undefined;
		source?.setData(buildData(stopsRef.current));
	}, [map, isLoaded, enabled, signature]);

	// Keep the selected + highlighted pins in sync via feature-state only.
	// biome-ignore lint/correctness/useExhaustiveDependencies: signature re-applies state to a changed stop set.
	useEffect(() => {
		selectedRef.current = selectedId;
		highlightRef.current = highlightId;
		if (map === null || !isLoaded || !enabled || map.getSource(SOURCE_ID) === undefined) {
			return;
		}
		for (const stop of stopsRef.current) {
			map.setFeatureState(
				{ source: SOURCE_ID, id: stop.id },
				{ selected: stop.id === selectedId, highlight: stop.id === highlightId },
			);
		}
	}, [map, isLoaded, enabled, selectedId, highlightId, signature]);
}
