import { LocateFixedIcon } from '@simmer-mosquito/ui-web/icons/registry';
import type { Map as MapboxMap } from 'mapbox-gl';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { MapCanvas, type RouteStopFeature } from '../map';
import { MapControlButton, MapControlGroup } from '../map/map-control';
import { boundsOfStops, type RouteStop } from './route-stop';

/**
 * Frame a map on a route's stops. It takes the stops as an argument rather than
 * closing over them so the auto-fit effect can depend on the stops themselves.
 */
function fitToRoute(instance: MapboxMap, stops: readonly RouteStop[], animate: boolean): void {
	const bounds = boundsOfStops(stops);
	if (bounds === null) {
		return;
	}
	const [[west, south], [east, north]] = bounds;
	const duration = animate ? 650 : 0;
	if (west === east && south === north) {
		instance.easeTo({
			center: [west, south],
			zoom: Math.max(instance.getZoom(), 15),
			duration,
		});
		return;
	}
	instance.fitBounds(
		[
			[west, south],
			[east, north],
		],
		{ padding: 72, maxZoom: 16, duration },
	);
}

interface RouteMapProps {
	readonly stops: readonly RouteStop[];
	readonly features: readonly RouteStopFeature[];
	readonly selectedId?: string | null | undefined;
	readonly highlightId?: string | null | undefined;
	readonly onSelectStop?: ((id: string | null) => void) | undefined;
	readonly onHoverStop?: ((id: string | null) => void) | undefined;
	/** Auto-fit once per value (e.g. the route id); changing it reframes the map. */
	readonly fitKey?: string | undefined;
	/** Floating content layered over the map (e.g. a route summary card). */
	readonly children?: ReactNode;
}

/**
 * The route map surface: a focused basemap (no search/layer chrome) carrying the
 * numbered-stop route layer, an auto-fit that reframes when the route changes,
 * and a manual "zoom to route" control. Selection and hover flow both ways
 * between here and the stop list through the layer's feature-state.
 */
export function RouteMap({
	stops,
	features,
	selectedId,
	highlightId,
	onSelectStop,
	onHoverStop,
	fitKey,
	children,
}: RouteMapProps) {
	const [map, setMap] = useState<MapboxMap | null>(null);
	const lastFitRef = useRef<string | null>(null);

	// Auto-fit once per fitKey, but only after geometry has actually resolved.
	useEffect(() => {
		if (map === null) {
			return;
		}
		if (boundsOfStops(stops) === null) {
			return;
		}
		const key = fitKey ?? '';
		if (lastFitRef.current === key) {
			return;
		}
		lastFitRef.current = key;
		fitToRoute(map, stops, true);
	}, [map, fitKey, stops]);

	const handleZoom = () => {
		if (map !== null) {
			fitToRoute(map, stops, true);
		}
	};

	const hasMappedStops = features.length > 0;
	const hasUnmappedOnly = !hasMappedStops && stops.length > 0;

	return (
		<>
			<MapCanvas
				controls={{ search: false }}
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
						<MapControlButton label="Zoom to route" onClick={handleZoom} side="right">
							<LocateFixedIcon aria-hidden="true" className="size-4" />
						</MapControlButton>
					</MapControlGroup>
				</div>
			) : null}

			{hasUnmappedOnly ? (
				<div className="pointer-events-none absolute inset-x-0 top-4 flex justify-center">
					<span className="rounded-full border border-border/70 bg-background/85 px-3 py-1 text-muted-foreground text-xs shadow-sm backdrop-blur-sm">
						No mapped stops on this route yet
					</span>
				</div>
			) : null}
		</>
	);
}
