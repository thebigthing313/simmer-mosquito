import {
	type BoundingBox,
	boundsFromGeoJson,
	extendBounds,
	type LngLat,
} from '@simmer-mosquito/mapping';
import { LocateFixedIcon } from '@simmer-mosquito/ui-web/icons/registry';
import type { Map as MapboxMap } from 'mapbox-gl';
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { MapCanvas, type RouteStopFeature } from '../../components/map';
import { MapControlButton, MapControlGroup } from '../../components/map/map-control';

/**
 * The worklist map: numbered stops in sequence, auto-framed when the worklist
 * changes, with a manual reframe control. Selection and hover flow both ways
 * between here and the stop list through the layer's feature-state.
 *
 * Both ordered worklists in this section render through it. An assignment's
 * stops are typed entity targets and a mission's are owned geometry, but by the
 * time either reaches a map it is the same thing: a place in the order, a
 * progress tone, and — where the stop owns one — a shape. `noun` is the only
 * thing that differs, and it only ever reaches the operator-facing strings.
 *
 * Bounds come straight off the features rather than a domain view model, because
 * everything the frame needs is already on them.
 */
export function WorklistMap({
	features,
	stopCount,
	noun,
	selectedId,
	highlightId,
	onSelectStop,
	onHoverStop,
	fitKey,
	children,
}: {
	readonly features: readonly RouteStopFeature[];
	/** Total stops including unmapped ones, so "none mapped" can be told apart from "none". */
	readonly stopCount: number;
	/** What the worklist is called, lowercase — "assignment", "mission". */
	readonly noun: string;
	readonly selectedId?: string | null | undefined;
	readonly highlightId?: string | null | undefined;
	readonly onSelectStop?: ((id: string | null) => void) | undefined;
	readonly onHoverStop?: ((id: string | null) => void) | undefined;
	/** Auto-fit once per value (the worklist id); changing it reframes the map. */
	readonly fitKey?: string | undefined;
	readonly children?: ReactNode;
}) {
	const [map, setMap] = useState<MapboxMap | null>(null);
	const featuresRef = useRef(features);
	featuresRef.current = features;
	const lastFitRef = useRef<string | null>(null);

	const fitToWorklist = useCallback((instance: MapboxMap, animate: boolean) => {
		const bounds = boundsOfFeatures(featuresRef.current);
		if (bounds === null) {
			return;
		}
		const [[west, south], [east, north]] = bounds;
		const duration = animate ? 650 : 0;
		if (west === east && south === north) {
			instance.easeTo({ center: [west, south], zoom: Math.max(instance.getZoom(), 15), duration });
			return;
		}
		instance.fitBounds(
			[
				[west, south],
				[east, north],
			],
			{ padding: 72, maxZoom: 16, duration },
		);
	}, []);

	// Fit once per worklist, and only once coordinates have actually resolved —
	// the targets stream in separately, so an early fit would frame an empty set.
	useEffect(() => {
		if (map === null || boundsOfFeatures(features) === null) {
			return;
		}
		const key = fitKey ?? '';
		if (lastFitRef.current === key) {
			return;
		}
		lastFitRef.current = key;
		fitToWorklist(map, true);
	}, [map, fitKey, features, fitToWorklist]);

	const handleZoom = useCallback(() => {
		if (map !== null) {
			fitToWorklist(map, true);
		}
	}, [map, fitToWorklist]);

	const hasMappedStops = features.length > 0;

	return (
		<>
			<MapCanvas
				controls={{ search: false, layers: false }}
				onMapReady={setMap}
				routeLayer={{
					stops: features,
					selectedId: selectedId ?? null,
					highlightId: highlightId ?? null,
					onSelectStop,
					onHoverStop,
				}}
			/>

			{children}

			{hasMappedStops ? (
				<div className="absolute bottom-4 left-4">
					<MapControlGroup>
						<MapControlButton label={`Zoom to ${noun}`} onClick={handleZoom} side="right">
							<LocateFixedIcon aria-hidden="true" className="size-4" />
						</MapControlButton>
					</MapControlGroup>
				</div>
			) : null}

			{!hasMappedStops && stopCount > 0 ? (
				<div className="pointer-events-none absolute inset-x-0 top-4 flex justify-center">
					<span className="rounded-full border border-border/70 bg-background/85 px-3 py-1 text-muted-foreground text-xs shadow-sm backdrop-blur-sm">
						No mapped stops on this {noun} yet
					</span>
				</div>
			) : null}
		</>
	);
}

/**
 * SW/NE bounds across every located stop, or null when none has coordinates.
 *
 * A stop that owns a shape is framed by the whole shape rather than by the pin
 * at its centroid: fitting a treated block on its centre point zooms past three
 * of its four edges.
 */
function boundsOfFeatures(
	features: readonly RouteStopFeature[],
): [[number, number], [number, number]] | null {
	let box: BoundingBox | null = null;
	for (const feature of features) {
		for (const point of framingPoints(feature)) {
			box = extendBounds(box, point);
		}
	}

	return box === null
		? null
		: [
				[box.west, box.south],
				[box.east, box.north],
			];
}

/** What a stop contributes to the frame: its shape's corners, or just its pin. */
function framingPoints(feature: RouteStopFeature): readonly LngLat[] {
	const shape = feature.geometry == null ? null : boundsFromGeoJson(feature.geometry);
	if (shape === null) {
		return [{ lng: feature.lng, lat: feature.lat }];
	}
	return [
		{ lng: shape.west, lat: shape.south },
		{ lng: shape.east, lat: shape.north },
	];
}
