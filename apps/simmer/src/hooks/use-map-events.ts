import { useCallback, useEffect, useRef, useState } from 'react';
import { useMapStore } from '@/src/stores/map-store';
import type { LngLat } from '@/src/stores/map-store';

interface MapClickEvent {
	lngLat: LngLat;
	point: { x: number; y: number };
	features?: mapboxgl.MapboxGeoJSONFeature[];
}

/**
 * Hook for subscribing to map click and interaction events.
 *
 * @example
 * ```tsx
 * useMapEvents({
 *   onClick: ({ lngLat }) => console.log('clicked at', lngLat),
 *   onMoveEnd: () => console.log('map stopped moving'),
 * });
 * ```
 */
export function useMapEvents(handlers: {
	onClick?: (e: MapClickEvent) => void;
	onDblClick?: (e: MapClickEvent) => void;
	onMoveStart?: () => void;
	onMoveEnd?: () => void;
	onZoomEnd?: () => void;
	onMouseMove?: (e: MapClickEvent) => void;
	onContextMenu?: (e: MapClickEvent) => void;
}) {
	const map = useMapStore((s) => s.map);
	const handlersRef = useRef(handlers);
	handlersRef.current = handlers;

	useEffect(() => {
		if (!map) return;

		const toMapClickEvent = (e: mapboxgl.MapMouseEvent): MapClickEvent => ({
			lngLat: { lng: e.lngLat.lng, lat: e.lngLat.lat },
			point: { x: e.point.x, y: e.point.y },
			features: (e as any).features,
		});

		const onClick = (e: mapboxgl.MapMouseEvent) =>
			handlersRef.current.onClick?.(toMapClickEvent(e));
		const onDblClick = (e: mapboxgl.MapMouseEvent) =>
			handlersRef.current.onDblClick?.(toMapClickEvent(e));
		const onMoveStart = () => handlersRef.current.onMoveStart?.();
		const onMoveEnd = () => handlersRef.current.onMoveEnd?.();
		const onZoomEnd = () => handlersRef.current.onZoomEnd?.();
		const onMouseMove = (e: mapboxgl.MapMouseEvent) =>
			handlersRef.current.onMouseMove?.(toMapClickEvent(e));
		const onContextMenu = (e: mapboxgl.MapMouseEvent) =>
			handlersRef.current.onContextMenu?.(toMapClickEvent(e));

		map.on('click', onClick);
		map.on('dblclick', onDblClick);
		map.on('movestart', onMoveStart);
		map.on('moveend', onMoveEnd);
		map.on('zoomend', onZoomEnd);
		map.on('mousemove', onMouseMove);
		map.on('contextmenu', onContextMenu);

		return () => {
			map.off('click', onClick);
			map.off('dblclick', onDblClick);
			map.off('movestart', onMoveStart);
			map.off('moveend', onMoveEnd);
			map.off('zoomend', onZoomEnd);
			map.off('mousemove', onMouseMove);
			map.off('contextmenu', onContextMenu);
		};
	}, [map]);
}

/**
 * Hook that returns the cursor's live lng/lat as the mouse moves over the map.
 *
 * @example
 * ```tsx
 * const cursorPosition = useMapCursorPosition();
 * // cursorPosition: { lng: -95.71, lat: 37.09 } | null
 * ```
 */
export function useMapCursorPosition() {
	const map = useMapStore((s) => s.map);
	const [position, setPosition] = useState<LngLat | null>(null);

	useEffect(() => {
		if (!map) return;
		const onMove = (e: mapboxgl.MapMouseEvent) => {
			setPosition({ lng: e.lngLat.lng, lat: e.lngLat.lat });
		};
		const onLeave = () => setPosition(null);
		map.on('mousemove', onMove);
		map.on('mouseout', onLeave);
		return () => {
			map.off('mousemove', onMove);
			map.off('mouseout', onLeave);
		};
	}, [map]);

	return position;
}

/**
 * Hook for measuring approximate distance between two points (Haversine).
 */
export function useMapDistance() {
	const haversine = useCallback(
		(a: LngLat, b: LngLat): number => {
			const R = 6371e3; // Earth radius in metres
			const toRad = (deg: number) => (deg * Math.PI) / 180;
			const dLat = toRad(b.lat - a.lat);
			const dLng = toRad(b.lng - a.lng);
			const sinDLat = Math.sin(dLat / 2);
			const sinDLng = Math.sin(dLng / 2);
			const h =
				sinDLat * sinDLat +
				Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinDLng * sinDLng;
			return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
		},
		[],
	);

	/** Distance in metres */
	const distanceMetres = useCallback(
		(a: LngLat, b: LngLat) => haversine(a, b),
		[haversine],
	);

	/** Distance in kilometres */
	const distanceKm = useCallback(
		(a: LngLat, b: LngLat) => haversine(a, b) / 1000,
		[haversine],
	);

	/** Distance in miles */
	const distanceMiles = useCallback(
		(a: LngLat, b: LngLat) => haversine(a, b) / 1609.344,
		[haversine],
	);

	return { distanceMetres, distanceKm, distanceMiles };
}
