import type { MapRef } from 'react-map-gl/mapbox';
import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LngLat {
	lng: number;
	lat: number;
}

export interface BoundingBox {
	sw: LngLat; // south-west
	ne: LngLat; // north-east
}

export interface FlyToOptions {
	center: LngLat;
	zoom?: number;
	pitch?: number;
	bearing?: number;
	duration?: number;
}

/** A marker managed by the store. */
export interface MapMarker {
	id: string;
	lngLat: LngLat;
	/** Optional popup HTML / text */
	popup?: string;
	/** Hex color for the default marker */
	color?: string;
	/** Custom DOM element class (for CSS-driven markers) */
	className?: string;
	/** Arbitrary metadata consumers can attach */
	data?: Record<string, unknown>;
	/** Whether the marker is currently visible (default true) */
	visible?: boolean;
}

/** GeoJSON-based polygon managed by the store. */
export interface MapPolygon {
	id: string;
	/** GeoJSON coordinates: [lng, lat][][] (outer ring + optional holes) */
	coordinates: [number, number][][];
	fillColor?: string;
	fillOpacity?: number;
	strokeColor?: string;
	strokeWidth?: number;
	/** Arbitrary metadata */
	data?: Record<string, unknown>;
	visible?: boolean;
}

/** GeoJSON-based line managed by the store. */
export interface MapLine {
	id: string;
	coordinates: [number, number][];
	color?: string;
	width?: number;
	dashArray?: number[];
	data?: Record<string, unknown>;
	visible?: boolean;
}

export type MapStyle =
	| 'mapbox://styles/mapbox/dark-v11'
	| 'mapbox://styles/mapbox/light-v11'
	| 'mapbox://styles/mapbox/streets-v12'
	| 'mapbox://styles/mapbox/outdoors-v12'
	| 'mapbox://styles/mapbox/satellite-v9'
	| 'mapbox://styles/mapbox/satellite-streets-v12'
	| (string & {});

export type MapProjection =
	| 'mercator'
	| 'globe'
	| 'equalEarth'
	| 'naturalEarth'
	| 'winkelTripel'
	| (string & {});

export type CursorStyle = 'auto' | 'pointer' | 'crosshair' | 'grab' | 'move';

// ---------------------------------------------------------------------------
// State & actions
// ---------------------------------------------------------------------------

export interface MapState {
	// — Map instance —
	/**
	 * The react-map-gl MapRef. Exposes camera methods (flyTo, easeTo, etc.)
	 * and read-only queries (getBounds, getZoom, etc.).
	 * Use `mapRef.getMap()` when you need the underlying mapbox-gl Map instance.
	 */
	mapRef: MapRef | null;
	mapLoaded: boolean;

	// — Viewport —
	center: LngLat;
	zoom: number;
	pitch: number;
	bearing: number;
	bounds: BoundingBox | null;

	// — Style / settings —
	/** Reactive: drives the Map component's `mapStyle` prop. */
	style: MapStyle;
	/** Reactive: drives the Map component's `projection` prop. */
	projection: MapProjection;
	/** Reactive: drives the Map component's `cursor` prop. */
	cursor: CursorStyle;
	/** Reactive: drives the Map component's interaction-handler props. */
	interactionsEnabled: boolean;
	terrain3D: boolean;

	// — Layers —
	markers: Map<string, MapMarker>;
	polygons: Map<string, MapPolygon>;
	lines: Map<string, MapLine>;
}

export interface MapActions {
	// — Map instance —
	setMapRef: (ref: MapRef) => void;
	setMapLoaded: (loaded: boolean) => void;

	// — Navigation —
	setCenter: (center: LngLat) => void;
	flyTo: (opts: FlyToOptions) => void;
	fitBounds: (
		bounds: BoundingBox,
		options?: { padding?: number; duration?: number },
	) => void;
	easeTo: (opts: Partial<FlyToOptions>) => void;
	zoomTo: (zoom: number, duration?: number) => void;
	resetNorth: (duration?: number) => void;
	setBearing: (bearing: number) => void;
	setPitch: (pitch: number) => void;

	// — Viewport tracking (called by the Map component's onMoveEnd) —
	_syncViewport: (
		center: LngLat,
		zoom: number,
		pitch: number,
		bearing: number,
		bounds: BoundingBox | null,
	) => void;

	// — Style / settings (pure state setters; Map reads reactively) —
	setStyle: (style: MapStyle) => void;
	setProjection: (projection: MapProjection) => void;
	setCursor: (cursor: CursorStyle) => void;
	setInteractionsEnabled: (enabled: boolean) => void;
	setTerrain3D: (enabled: boolean) => void;

	// — Markers —
	addMarker: (marker: MapMarker) => void;
	addMarkers: (markers: MapMarker[]) => void;
	updateMarker: (id: string, patch: Partial<Omit<MapMarker, 'id'>>) => void;
	removeMarker: (id: string) => void;
	removeAllMarkers: () => void;
	setMarkerVisibility: (id: string, visible: boolean) => void;

	// — Polygons —
	addPolygon: (polygon: MapPolygon) => void;
	addPolygons: (polygons: MapPolygon[]) => void;
	updatePolygon: (id: string, patch: Partial<Omit<MapPolygon, 'id'>>) => void;
	removePolygon: (id: string) => void;
	removeAllPolygons: () => void;
	setPolygonVisibility: (id: string, visible: boolean) => void;

	// — Lines —
	addLine: (line: MapLine) => void;
	addLines: (lines: MapLine[]) => void;
	updateLine: (id: string, patch: Partial<Omit<MapLine, 'id'>>) => void;
	removeLine: (id: string) => void;
	removeAllLines: () => void;
	setLineVisibility: (id: string, visible: boolean) => void;

	// — Bulk —
	clearAllLayers: () => void;
}

export type MapStore = MapState & MapActions;

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_CENTER: LngLat = { lng: -95.7129, lat: 37.0902 }; // Center of US
const DEFAULT_ZOOM = 4;
const DEFAULT_PITCH = 0;
const DEFAULT_BEARING = 0;
const DEFAULT_STYLE: MapStyle = 'mapbox://styles/mapbox/dark-v11';

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useMapStore = create<MapStore>()(
	subscribeWithSelector((set, get) => ({
		// — initial state —
		mapRef: null,
		mapLoaded: false,

		center: DEFAULT_CENTER,
		zoom: DEFAULT_ZOOM,
		pitch: DEFAULT_PITCH,
		bearing: DEFAULT_BEARING,
		bounds: null,

		style: DEFAULT_STYLE,
		projection: 'mercator',
		cursor: 'auto',
		interactionsEnabled: true,
		terrain3D: false,

		markers: new Map(),
		polygons: new Map(),
		lines: new Map(),

		// ---------------------------------------------------------------
		// Map instance
		// ---------------------------------------------------------------
		setMapRef: (ref) => set({ mapRef: ref }),
		setMapLoaded: (loaded) => set({ mapLoaded: loaded }),

		// ---------------------------------------------------------------
		// Navigation
		// ---------------------------------------------------------------
		setCenter: (center) => {
			const { mapRef } = get();
			mapRef?.jumpTo({ center: [center.lng, center.lat] });
			set({ center });
		},

		flyTo: (opts) => {
			const { mapRef } = get();
			mapRef?.flyTo({
				center: [opts.center.lng, opts.center.lat],
				...(opts.zoom != null && { zoom: opts.zoom }),
				...(opts.pitch != null && { pitch: opts.pitch }),
				...(opts.bearing != null && { bearing: opts.bearing }),
				duration: opts.duration ?? 2000,
			});
			// State is synced via the Map component's onMoveEnd callback.
		},

		fitBounds: (bounds, options) => {
			const { mapRef } = get();
			mapRef?.fitBounds(
				[
					[bounds.sw.lng, bounds.sw.lat],
					[bounds.ne.lng, bounds.ne.lat],
				],
				{
					padding: options?.padding ?? 50,
					duration: options?.duration ?? 1500,
				},
			);
		},

		easeTo: (opts) => {
			const { mapRef } = get();
			mapRef?.easeTo({
				...(opts.center && {
					center: [opts.center.lng, opts.center.lat] as [number, number],
				}),
				...(opts.zoom != null && { zoom: opts.zoom }),
				...(opts.pitch != null && { pitch: opts.pitch }),
				...(opts.bearing != null && { bearing: opts.bearing }),
				duration: opts.duration ?? 1000,
			});
		},

		zoomTo: (zoom, duration = 1000) => {
			const { mapRef } = get();
			mapRef?.zoomTo(zoom, { duration });
			set({ zoom });
		},

		resetNorth: (duration = 1000) => {
			const { mapRef } = get();
			mapRef?.resetNorth({ duration });
			set({ bearing: 0 });
		},

		setBearing: (bearing) => {
			const { mapRef } = get();
			mapRef?.getMap().setBearing(bearing);
			set({ bearing });
		},

		setPitch: (pitch) => {
			const { mapRef } = get();
			mapRef?.getMap().setPitch(pitch);
			set({ pitch });
		},

		// ---------------------------------------------------------------
		// Internal viewport sync (called by Map component's onMoveEnd)
		// ---------------------------------------------------------------
		_syncViewport: (center, zoom, pitch, bearing, bounds) =>
			set({ center, zoom, pitch, bearing, bounds }),

		// ---------------------------------------------------------------
		// Style / settings — pure state setters.
		// The Map component reads these reactively and passes them as props.
		// ---------------------------------------------------------------
		setStyle: (style) => set({ style }),

		setProjection: (projection) => set({ projection }),

		setCursor: (cursor) => set({ cursor }),

		setInteractionsEnabled: (enabled) => set({ interactionsEnabled: enabled }),

		setTerrain3D: (enabled) => {
			const { mapRef } = get();
			if (mapRef) {
				const map = mapRef.getMap();
				if (enabled) {
					if (!map.getSource('mapbox-dem')) {
						map.addSource('mapbox-dem', {
							type: 'raster-dem',
							url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
							tileSize: 512,
							maxzoom: 14,
						});
					}
					map.setTerrain({ source: 'mapbox-dem', exaggeration: 1.5 });
				} else {
					map.setTerrain(null);
				}
			}
			set({ terrain3D: enabled });
		},

		// ---------------------------------------------------------------
		// Markers
		// ---------------------------------------------------------------
		addMarker: (marker) =>
			set((s) => {
				const next = new Map(s.markers);
				next.set(marker.id, { visible: true, ...marker });
				return { markers: next };
			}),

		addMarkers: (markers) =>
			set((s) => {
				const next = new Map(s.markers);
				for (const m of markers) next.set(m.id, { visible: true, ...m });
				return { markers: next };
			}),

		updateMarker: (id, patch) =>
			set((s) => {
				const existing = s.markers.get(id);
				if (!existing) return s;
				const next = new Map(s.markers);
				next.set(id, { ...existing, ...patch });
				return { markers: next };
			}),

		removeMarker: (id) =>
			set((s) => {
				const next = new Map(s.markers);
				next.delete(id);
				return { markers: next };
			}),

		removeAllMarkers: () => set({ markers: new Map() }),

		setMarkerVisibility: (id, visible) =>
			set((s) => {
				const existing = s.markers.get(id);
				if (!existing) return s;
				const next = new Map(s.markers);
				next.set(id, { ...existing, visible });
				return { markers: next };
			}),

		// ---------------------------------------------------------------
		// Polygons
		// ---------------------------------------------------------------
		addPolygon: (polygon) =>
			set((s) => {
				const next = new Map(s.polygons);
				next.set(polygon.id, {
					visible: true,
					fillOpacity: 0.3,
					strokeWidth: 2,
					...polygon,
				});
				return { polygons: next };
			}),

		addPolygons: (polygons) =>
			set((s) => {
				const next = new Map(s.polygons);
				for (const p of polygons)
					next.set(p.id, {
						visible: true,
						fillOpacity: 0.3,
						strokeWidth: 2,
						...p,
					});
				return { polygons: next };
			}),

		updatePolygon: (id, patch) =>
			set((s) => {
				const existing = s.polygons.get(id);
				if (!existing) return s;
				const next = new Map(s.polygons);
				next.set(id, { ...existing, ...patch });
				return { polygons: next };
			}),

		removePolygon: (id) =>
			set((s) => {
				const next = new Map(s.polygons);
				next.delete(id);
				return { polygons: next };
			}),

		removeAllPolygons: () => set({ polygons: new Map() }),

		setPolygonVisibility: (id, visible) =>
			set((s) => {
				const existing = s.polygons.get(id);
				if (!existing) return s;
				const next = new Map(s.polygons);
				next.set(id, { ...existing, visible });
				return { polygons: next };
			}),

		// ---------------------------------------------------------------
		// Lines
		// ---------------------------------------------------------------
		addLine: (line) =>
			set((s) => {
				const next = new Map(s.lines);
				next.set(line.id, { visible: true, width: 2, ...line });
				return { lines: next };
			}),

		addLines: (lines) =>
			set((s) => {
				const next = new Map(s.lines);
				for (const l of lines)
					next.set(l.id, { visible: true, width: 2, ...l });
				return { lines: next };
			}),

		updateLine: (id, patch) =>
			set((s) => {
				const existing = s.lines.get(id);
				if (!existing) return s;
				const next = new Map(s.lines);
				next.set(id, { ...existing, ...patch });
				return { lines: next };
			}),

		removeLine: (id) =>
			set((s) => {
				const next = new Map(s.lines);
				next.delete(id);
				return { lines: next };
			}),

		removeAllLines: () => set({ lines: new Map() }),

		setLineVisibility: (id, visible) =>
			set((s) => {
				const existing = s.lines.get(id);
				if (!existing) return s;
				const next = new Map(s.lines);
				next.set(id, { ...existing, visible });
				return { lines: next };
			}),

		// ---------------------------------------------------------------
		// Bulk
		// ---------------------------------------------------------------
		clearAllLayers: () =>
			set({
				markers: new Map(),
				polygons: new Map(),
				lines: new Map(),
			}),
	})),
);
