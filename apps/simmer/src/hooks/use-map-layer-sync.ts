import mapboxgl from 'mapbox-gl';
import { useEffect, useRef } from 'react';
import { useMapStore } from '@/src/stores/map-store';
import type { MapLine, MapMarker, MapPolygon } from '@/src/stores/map-store';

/**
 * Imperatively syncs Zustand store markers / polygons / lines onto the
 * live Mapbox GL map.  Must be rendered exactly once as a sibling / child
 * of the component that owns the map container.
 *
 * - **Markers** – uses native `mapboxgl.Marker` instances.
 * - **Polygons** – each polygon gets its own GeoJSON source + fill layer +
 *   line (stroke) layer.
 * - **Lines** – each line gets its own GeoJSON source + line layer.
 *
 * The hook subscribes directly to the Zustand store (outside React render)
 * via `useMapStore.subscribe` so that updates are applied immediately
 * without waiting for React to re-render.
 */
export function useMapLayerSync() {
	// Live refs so the subscription callbacks always see the latest map
	const markersRef = useRef<Map<string, mapboxgl.Marker>>(new Map());
	const popupsRef = useRef<Map<string, mapboxgl.Popup>>(new Map());

	// Ids we have added to the map – used during cleanup
	const polygonIdsRef = useRef<Set<string>>(new Set());
	const lineIdsRef = useRef<Set<string>>(new Set());

	useEffect(() => {
		// Wait until map is available in the store
		const waitForMap = () => {
			const { map, mapLoaded } = useMapStore.getState();
			if (map && mapLoaded) return map;
			return null;
		};

		let map = waitForMap();

		// If the map isn't ready yet, subscribe until it is
		const unsubLoad = useMapStore.subscribe(
			(s) => s.mapLoaded,
			(loaded) => {
				if (loaded) {
					map = useMapStore.getState().map;
					if (map) {
						// Perform initial sync
						syncMarkers(map, useMapStore.getState().markers);
						syncPolygons(map, useMapStore.getState().polygons);
						syncLines(map, useMapStore.getState().lines);
					}
				}
			},
		);

		// ---------------------------------------------------------------
		//  MARKERS
		// ---------------------------------------------------------------
		function syncMarkers(m: mapboxgl.Map, storeMarkers: Map<string, MapMarker>) {
			const live = markersRef.current;
			const livePopups = popupsRef.current;

			// Remove markers that no longer exist in the store
			for (const [id, marker] of live) {
				if (!storeMarkers.has(id)) {
					marker.remove();
					live.delete(id);
					livePopups.get(id)?.remove();
					livePopups.delete(id);
				}
			}

			// Add / update markers
			for (const [id, data] of storeMarkers) {
				const existing = live.get(id);

				if (existing) {
					// Update position
					existing.setLngLat([data.lngLat.lng, data.lngLat.lat]);

					// Update visibility
					const el = existing.getElement();
					if (el) {
						el.style.display = data.visible === false ? 'none' : '';
					}

					// Update popup content if changed
					if (data.popup) {
						const existingPopup = livePopups.get(id);
						if (existingPopup) {
							existingPopup.setHTML(data.popup);
						} else {
							const popup = new mapboxgl.Popup({ offset: 25, closeButton: false })
								.setHTML(data.popup);
							existing.setPopup(popup);
							livePopups.set(id, popup);
						}
					}
				} else {
					// Create new marker
					const marker = new mapboxgl.Marker({
						color: data.color ?? '#10b981',
						...(data.className && { className: data.className }),
					})
						.setLngLat([data.lngLat.lng, data.lngLat.lat])
						.addTo(m);

					// Visibility
					if (data.visible === false) {
						const el = marker.getElement();
						if (el) el.style.display = 'none';
					}

					// Popup
					if (data.popup) {
						const popup = new mapboxgl.Popup({ offset: 25, closeButton: false })
							.setHTML(data.popup);
						marker.setPopup(popup);
						livePopups.set(id, popup);
					}

					live.set(id, marker);
				}
			}
		}

		const unsubMarkers = useMapStore.subscribe(
			(s) => s.markers,
			(markers) => {
				if (map) syncMarkers(map, markers);
			},
		);

		// ---------------------------------------------------------------
		//  POLYGONS
		// ---------------------------------------------------------------
		function syncPolygons(m: mapboxgl.Map, storePolygons: Map<string, MapPolygon>) {
			const tracked = polygonIdsRef.current;

			// Remove polygons no longer in the store
			for (const id of tracked) {
				if (!storePolygons.has(id)) {
					safeRemoveLayer(m, `polygon-fill-${id}`);
					safeRemoveLayer(m, `polygon-stroke-${id}`);
					safeRemoveSource(m, `polygon-${id}`);
					tracked.delete(id);
				}
			}

			// Add / update
			for (const [id, data] of storePolygons) {
				const sourceId = `polygon-${id}`;
				const fillLayerId = `polygon-fill-${id}`;
				const strokeLayerId = `polygon-stroke-${id}`;

				const geojson: GeoJSON.Feature<GeoJSON.Polygon> = {
					type: 'Feature',
					properties: {},
					geometry: {
						type: 'Polygon',
						coordinates: data.coordinates,
					},
				};

				const source = m.getSource(sourceId) as mapboxgl.GeoJSONSource | undefined;

				if (source) {
					// Update existing
					source.setData(geojson);

					// Update paint properties
					if (m.getLayer(fillLayerId)) {
						m.setPaintProperty(fillLayerId, 'fill-color', data.fillColor ?? '#10b981');
						m.setPaintProperty(fillLayerId, 'fill-opacity', data.visible === false ? 0 : (data.fillOpacity ?? 0.3));
						m.setLayoutProperty(fillLayerId, 'visibility', data.visible === false ? 'none' : 'visible');
					}
					if (m.getLayer(strokeLayerId)) {
						m.setPaintProperty(strokeLayerId, 'line-color', data.strokeColor ?? data.fillColor ?? '#10b981');
						m.setPaintProperty(strokeLayerId, 'line-width', data.strokeWidth ?? 2);
						m.setLayoutProperty(strokeLayerId, 'visibility', data.visible === false ? 'none' : 'visible');
					}
				} else {
					// Create source + layers
					m.addSource(sourceId, { type: 'geojson', data: geojson });

					m.addLayer({
						id: fillLayerId,
						type: 'fill',
						source: sourceId,
						paint: {
							'fill-color': data.fillColor ?? '#10b981',
							'fill-opacity': data.fillOpacity ?? 0.3,
						},
						layout: {
							visibility: data.visible === false ? 'none' : 'visible',
						},
					});

					m.addLayer({
						id: strokeLayerId,
						type: 'line',
						source: sourceId,
						paint: {
							'line-color': data.strokeColor ?? data.fillColor ?? '#10b981',
							'line-width': data.strokeWidth ?? 2,
						},
						layout: {
							visibility: data.visible === false ? 'none' : 'visible',
						},
					});

					tracked.add(id);
				}
			}
		}

		const unsubPolygons = useMapStore.subscribe(
			(s) => s.polygons,
			(polygons) => {
				if (map) syncPolygons(map, polygons);
			},
		);

		// ---------------------------------------------------------------
		//  LINES
		// ---------------------------------------------------------------
		function syncLines(m: mapboxgl.Map, storeLines: Map<string, MapLine>) {
			const tracked = lineIdsRef.current;

			// Remove lines no longer in the store
			for (const id of tracked) {
				if (!storeLines.has(id)) {
					safeRemoveLayer(m, `line-${id}`);
					safeRemoveSource(m, `line-src-${id}`);
					tracked.delete(id);
				}
			}

			// Add / update
			for (const [id, data] of storeLines) {
				const sourceId = `line-src-${id}`;
				const layerId = `line-${id}`;

				const geojson: GeoJSON.Feature<GeoJSON.LineString> = {
					type: 'Feature',
					properties: {},
					geometry: {
						type: 'LineString',
						coordinates: data.coordinates,
					},
				};

				const source = m.getSource(sourceId) as mapboxgl.GeoJSONSource | undefined;

				if (source) {
					source.setData(geojson);

					if (m.getLayer(layerId)) {
						m.setPaintProperty(layerId, 'line-color', data.color ?? '#f59e0b');
						m.setPaintProperty(layerId, 'line-width', data.width ?? 2);
						m.setLayoutProperty(layerId, 'visibility', data.visible === false ? 'none' : 'visible');

						if (data.dashArray) {
							m.setPaintProperty(layerId, 'line-dasharray', data.dashArray);
						}
					}
				} else {
					m.addSource(sourceId, { type: 'geojson', data: geojson });

					m.addLayer({
						id: layerId,
						type: 'line',
						source: sourceId,
						paint: {
							'line-color': data.color ?? '#f59e0b',
							'line-width': data.width ?? 2,
							...(data.dashArray && { 'line-dasharray': data.dashArray }),
						},
						layout: {
							'line-cap': 'round' as const,
							'line-join': 'round' as const,
							visibility: data.visible === false ? 'none' : 'visible',
						},
					});

					tracked.add(id);
				}
			}
		}

		const unsubLines = useMapStore.subscribe(
			(s) => s.lines,
			(lines) => {
				if (map) syncLines(map, lines);
			},
		);

		// ---------------------------------------------------------------
		//  Style change handler – re-add sources/layers after style swap
		// ---------------------------------------------------------------
		function handleStyleData() {
			if (!map) return;
			// After a style change Mapbox removes all custom sources/layers,
			// so we need to re-add them. Markers survive because they are DOM.
			const state = useMapStore.getState();

			// Clear tracked IDs since the sources/layers are gone
			polygonIdsRef.current.clear();
			lineIdsRef.current.clear();

			syncPolygons(map, state.polygons);
			syncLines(map, state.lines);
		}

		if (map) {
			map.on('style.load', handleStyleData);

			// Initial sync if map is already loaded
			syncMarkers(map, useMapStore.getState().markers);
			syncPolygons(map, useMapStore.getState().polygons);
			syncLines(map, useMapStore.getState().lines);
		}

		// ---------------------------------------------------------------
		//  Cleanup
		// ---------------------------------------------------------------
		return () => {
			unsubLoad();
			unsubMarkers();
			unsubPolygons();
			unsubLines();

			if (map) {
				map.off('style.load', handleStyleData);
			}

			// Remove all live markers
			for (const marker of markersRef.current.values()) marker.remove();
			markersRef.current.clear();
			for (const popup of popupsRef.current.values()) popup.remove();
			popupsRef.current.clear();

			// Remove polygon layers/sources
			if (map) {
				for (const id of polygonIdsRef.current) {
					safeRemoveLayer(map, `polygon-fill-${id}`);
					safeRemoveLayer(map, `polygon-stroke-${id}`);
					safeRemoveSource(map, `polygon-${id}`);
				}
				polygonIdsRef.current.clear();

				for (const id of lineIdsRef.current) {
					safeRemoveLayer(map, `line-${id}`);
					safeRemoveSource(map, `line-src-${id}`);
				}
				lineIdsRef.current.clear();
			}
		};
	}, []);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function safeRemoveLayer(map: mapboxgl.Map, id: string) {
	try {
		if (map.getLayer(id)) map.removeLayer(id);
	} catch {
		// layer may already be removed (e.g. after style change)
	}
}

function safeRemoveSource(map: mapboxgl.Map, id: string) {
	try {
		if (map.getSource(id)) map.removeSource(id);
	} catch {
		// source may already be removed
	}
}
