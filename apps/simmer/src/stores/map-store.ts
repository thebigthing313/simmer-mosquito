import type { Map as MapboxMap } from 'mapbox-gl';
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
	/** The live Mapbox GL JS map instance (set by the MapboxMap component) */
	map: MapboxMap | null;
	mapLoaded: boolean;

	// — Viewport —
	center: LngLat;
	zoom: number;
	pitch: number;
	bearing: number;
	bounds: BoundingBox | null;

	// — Style / settings —
	style: MapStyle;
	projection: MapProjection;
	cursor: CursorStyle;
	interactionsEnabled: boolean;
	terrain3D: boolean;

	// — Layers —
	markers: Map<string, MapMarker>;
	polygons: Map<string, MapPolygon>;
	lines: Map<string, MapLine>;
}

export interface MapActions {
	// — Map instance —
	setMap: (map: MapboxMap) => void;
	setMapLoaded: (loaded: boolean) => void;

	// — Navigation —
	setCenter: (center: LngLat) => void;
	flyTo: (opts: FlyToOptions) => void;
	fitBounds: (bounds: BoundingBox, options?: { padding?: number; duration?: number }) => void;
	easeTo: (opts: Partial<FlyToOptions>) => void;
	zoomTo: (zoom: number, duration?: number) => void;
	resetNorth: (duration?: number) => void;
	setBearing: (bearing: number) => void;
	setPitch: (pitch: number) => void;

	// — Viewport tracking (called internally by move listeners) —
	_syncViewport: (center: LngLat, zoom: number, pitch: number, bearing: number, bounds: BoundingBox | null) => void;

	// — Style / settings —
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
		map: null,
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
		setMap: (map) => set({ map }),
		setMapLoaded: (loaded) => set({ mapLoaded: loaded }),

		// ---------------------------------------------------------------
		// Navigation
		// ---------------------------------------------------------------
		setCenter: (center) => {
			const { map } = get();
			map?.setCenter([center.lng, center.lat]);
			set({ center });
		},

		flyTo: (opts) => {
			const { map } = get();
			map?.flyTo({
				center: [opts.center.lng, opts.center.lat],
				...(opts.zoom != null && { zoom: opts.zoom }),
				...(opts.pitch != null && { pitch: opts.pitch }),
				...(opts.bearing != null && { bearing: opts.bearing }),
				duration: opts.duration ?? 2000,
			});
			set({
				center: opts.center,
				...(opts.zoom != null && { zoom: opts.zoom }),
				...(opts.pitch != null && { pitch: opts.pitch }),
				...(opts.bearing != null && { bearing: opts.bearing }),
			});
		},

		fitBounds: (bounds, options) => {
			const { map } = get();
			map?.fitBounds(
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
			const { map } = get();
			map?.easeTo({
				...(opts.center && { center: [opts.center.lng, opts.center.lat] as [number, number] }),
				...(opts.zoom != null && { zoom: opts.zoom }),
				...(opts.pitch != null && { pitch: opts.pitch }),
				...(opts.bearing != null && { bearing: opts.bearing }),
				duration: opts.duration ?? 1000,
			});
			set({
				...(opts.center && { center: opts.center }),
				...(opts.zoom != null && { zoom: opts.zoom }),
				...(opts.pitch != null && { pitch: opts.pitch }),
				...(opts.bearing != null && { bearing: opts.bearing }),
			});
		},

		zoomTo: (zoom, duration = 1000) => {
			const { map } = get();
			map?.zoomTo(zoom, { duration });
			set({ zoom });
		},

		resetNorth: (duration = 1000) => {
			const { map } = get();
			map?.resetNorth({ duration });
			set({ bearing: 0 });
		},

		setBearing: (bearing) => {
			const { map } = get();
			map?.setBearing(bearing);
			set({ bearing });
		},

		setPitch: (pitch) => {
			const { map } = get();
			map?.setPitch(pitch);
			set({ pitch });
		},

		// ---------------------------------------------------------------
		// Internal viewport sync
		// ---------------------------------------------------------------
		_syncViewport: (center, zoom, pitch, bearing, bounds) =>
			set({ center, zoom, pitch, bearing, bounds }),

		// ---------------------------------------------------------------
		// Style / settings
		// ---------------------------------------------------------------
		setStyle: (style) => {
			const { map } = get();
			map?.setStyle(style);
			set({ style });
		},

		setProjection: (projection) => {
			const { map } = get();
			(map as any)?.setProjection?.(projection);
			set({ projection });
		},

		setCursor: (cursor) => {
			const { map } = get();
			if (map) {
				map.getCanvas().style.cursor = cursor;
			}
			set({ cursor });
		},

		setInteractionsEnabled: (enabled) => {
			const { map } = get();
			if (map) {
				if (enabled) {
					map.dragPan.enable();
					map.scrollZoom.enable();
					map.boxZoom.enable();
					map.dragRotate.enable();
					map.keyboard.enable();
					map.doubleClickZoom.enable();
					map.touchZoomRotate.enable();
				} else {
					map.dragPan.disable();
					map.scrollZoom.disable();
					map.boxZoom.disable();
					map.dragRotate.disable();
					map.keyboard.disable();
					map.doubleClickZoom.disable();
					map.touchZoomRotate.disable();
				}
			}
			set({ interactionsEnabled: enabled });
		},

		setTerrain3D: (enabled) => {
			const { map } = get();
			if (map) {
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
				next.set(polygon.id, { visible: true, fillOpacity: 0.3, strokeWidth: 2, ...polygon });
				return { polygons: next };
			}),

		addPolygons: (polygons) =>
			set((s) => {
				const next = new Map(s.polygons);
				for (const p of polygons) next.set(p.id, { visible: true, fillOpacity: 0.3, strokeWidth: 2, ...p });
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
				for (const l of lines) next.set(l.id, { visible: true, width: 2, ...l });
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
