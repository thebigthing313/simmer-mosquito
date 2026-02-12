import mapboxgl from 'mapbox-gl';
import { memo, useCallback, useEffect, useMemo, useRef } from 'react';
import type { MapRef } from 'react-map-gl/mapbox';
// biome-ignore lint/suspicious/noShadowRestrictedNames: <visgl map instance, not the global mapboxgl.Map class>
import Map, { Layer, Marker, Source } from 'react-map-gl/mapbox';
import 'mapbox-gl/dist/mapbox-gl.css';
import {
	MapAttribution,
	MapControls,
	MapCoordinateDisplay,
	MapScaleBar,
	MapStyleSwitcher,
} from '@/src/components/map';
import { useUserLocation } from '@/src/hooks/use-user-location';
import { useMapStore } from '@/src/stores/map-store';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN;

/**
 * Persistent full-viewport map container built on react-map-gl.
 *
 * Uses **uncontrolled** mode (`initialViewState`) — the map manages its own
 * camera internally. Viewport state is synced back to Zustand on `moveEnd`
 * so the rest of the app can read it.
 *
 * Markers, polygons, and lines from the Zustand store are rendered
 * declaratively as `<Marker>`, `<Source>` + `<Layer>` children — eliminating
 * the old imperative `useMapLayerSync` hook entirely.
 *
 * Per react-map-gl tips-and-tricks:
 * - `reuseMaps` avoids billable re-init on frequent mount / unmount.
 * - Markers/layers are wrapped in `useMemo` to prevent needless re-creation
 *   during camera animation frames.
 *
 * Memoized so it never re-renders when layouts toggle above it.
 */
function MapboxMapInner() {
	const mapRef = useRef<MapRef>(null);

	// ── Store selectors ──────────────────────────────────────────────────
	const mapLoaded = useMapStore((s) => s.mapLoaded);
	const style = useMapStore((s) => s.style);
	const projection = useMapStore((s) => s.projection);
	const cursor = useMapStore((s) => s.cursor);
	const interactionsEnabled = useMapStore((s) => s.interactionsEnabled);
	const markers = useMapStore((s) => s.markers);
	const polygons = useMapStore((s) => s.polygons);
	const lines = useMapStore((s) => s.lines);

	const setMapRef = useMapStore((s) => s.setMapRef);
	const setMapLoaded = useMapStore((s) => s.setMapLoaded);
	const _syncViewport = useMapStore((s) => s._syncViewport);

	const { location } = useUserLocation();

	// ── Callbacks ────────────────────────────────────────────────────────

	const onLoad = useCallback(() => {
		if (mapRef.current) {
			setMapRef(mapRef.current);
		}
		setMapLoaded(true);
	}, [setMapRef, setMapLoaded]);

	/** Sync viewport state back to Zustand when the map finishes moving. */
	const onMoveEnd = useCallback(() => {
		const m = mapRef.current;
		if (!m) return;
		const center = m.getCenter();
		const bounds = m.getBounds();
		_syncViewport(
			{ lng: center.lng, lat: center.lat },
			m.getZoom(),
			m.getPitch(),
			m.getBearing(),
			bounds
				? {
						sw: {
							lng: bounds.getSouthWest().lng,
							lat: bounds.getSouthWest().lat,
						},
						ne: {
							lng: bounds.getNorthEast().lng,
							lat: bounds.getNorthEast().lat,
						},
					}
				: null,
		);
	}, [_syncViewport]);

	// ── Fly to user location once available ──────────────────────────────
	useEffect(() => {
		if (!mapRef.current || !mapLoaded || !location) return;
		mapRef.current.flyTo({
			center: [location.lng, location.lat],
			zoom: 12,
			duration: 2000,
		});
	}, [location, mapLoaded]);

	// ── Declarative markers (memoized per react-map-gl tips) ─────────────
	const markerElements = useMemo(() => {
		return Array.from(markers.values())
			.filter((m) => m.visible !== false)
			.map((m) => {
				const popup = m.popup
					? new mapboxgl.Popup({ offset: 25, closeButton: false }).setHTML(
							m.popup,
						)
					: undefined;
				return (
					<Marker
						key={m.id}
						longitude={m.lngLat.lng}
						latitude={m.lngLat.lat}
						color={m.color ?? '#10b981'}
						popup={popup}
					/>
				);
			});
	}, [markers]);

	// ── Declarative polygon layers ───────────────────────────────────────
	const polygonElements = useMemo(() => {
		return Array.from(polygons.values())
			.filter((p) => p.visible !== false)
			.map((p) => (
				<Source
					key={p.id}
					id={`polygon-${p.id}`}
					type="geojson"
					data={{
						type: 'Feature' as const,
						properties: {},
						geometry: {
							type: 'Polygon' as const,
							coordinates: p.coordinates,
						},
					}}
				>
					<Layer
						id={`polygon-fill-${p.id}`}
						type="fill"
						paint={{
							'fill-color': p.fillColor ?? '#10b981',
							'fill-opacity': p.fillOpacity ?? 0.3,
						}}
					/>
					<Layer
						id={`polygon-stroke-${p.id}`}
						type="line"
						paint={{
							'line-color': p.strokeColor ?? p.fillColor ?? '#10b981',
							'line-width': p.strokeWidth ?? 2,
						}}
					/>
				</Source>
			));
	}, [polygons]);

	// ── Declarative line layers ──────────────────────────────────────────
	const lineElements = useMemo(() => {
		return Array.from(lines.values())
			.filter((l) => l.visible !== false)
			.map((l) => (
				<Source
					key={l.id}
					id={`line-src-${l.id}`}
					type="geojson"
					data={{
						type: 'Feature' as const,
						properties: {},
						geometry: {
							type: 'LineString' as const,
							coordinates: l.coordinates,
						},
					}}
				>
					<Layer
						id={`line-${l.id}`}
						type="line"
						paint={{
							'line-color': l.color ?? '#f59e0b',
							'line-width': l.width ?? 2,
							...(l.dashArray && {
								'line-dasharray': l.dashArray,
							}),
						}}
						layout={{
							'line-cap': 'round',
							'line-join': 'round',
						}}
					/>
				</Source>
			));
	}, [lines]);

	// ── Render ────────────────────────────────────────────────────────────
	return (
		<div className="absolute inset-0 z-0">
			<Map
				ref={mapRef}
				reuseMaps
				mapboxAccessToken={MAPBOX_TOKEN}
				initialViewState={{
					longitude: -95.7129,
					latitude: 37.0902,
					zoom: 4,
					pitch: 0,
					bearing: 0,
				}}
				mapStyle={style}
				projection={
					projection as
						| 'mercator'
						| 'globe'
						| 'equalEarth'
						| 'naturalEarth'
						| 'winkelTripel'
				}
				cursor={cursor}
				attributionControl={false}
				logoPosition="bottom-right"
				dragPan={interactionsEnabled}
				scrollZoom={interactionsEnabled}
				boxZoom={interactionsEnabled}
				dragRotate={interactionsEnabled}
				keyboard={interactionsEnabled}
				doubleClickZoom={interactionsEnabled}
				touchZoomRotate={interactionsEnabled}
				onLoad={onLoad}
				onMoveEnd={onMoveEnd}
				style={{ width: '100%', height: '100%' }}
			>
				{markerElements}
				{polygonElements}
				{lineElements}
			</Map>

			{/* Custom branded controls */}
			<MapControls />
			<MapStyleSwitcher />
			<MapScaleBar />
			<MapCoordinateDisplay />
			<MapAttribution />

			{!mapLoaded && (
				<div className="absolute inset-0 flex items-center justify-center bg-zinc-950">
					<div className="flex flex-col items-center gap-3">
						<div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-600 border-t-emerald-500" />
						<span className="text-xs text-zinc-500 uppercase tracking-widest">
							Loading Map
						</span>
					</div>
				</div>
			)}
		</div>
	);
}

export const MapboxMap = memo(MapboxMapInner);
