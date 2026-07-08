import { LocateFixedIcon } from '@simmer-mosquito/ui-web/icons/registry';
import type { Map as MapboxMap } from 'mapbox-gl';
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { MapCanvas, type RouteStopFeature } from '../../../../components/map';
import { MapControlButton, MapControlGroup } from '../../../../components/map/map-control';
import { boundsOfStops, type RouteStopView } from './-trap-route-data';

interface TrapRouteMapProps {
	readonly stops: readonly RouteStopView[];
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
 * The trap-route map surface: a focused basemap carrying the numbered-stop route
 * layer, an auto-fit that reframes when the route changes, and a manual
 * "zoom to route" control. Mirrors the habitat route map, over trap stops.
 */
export function TrapRouteMap({
	stops,
	features,
	selectedId,
	highlightId,
	onSelectStop,
	onHoverStop,
	fitKey,
	children,
}: TrapRouteMapProps) {
	const [map, setMap] = useState<MapboxMap | null>(null);
	const stopsRef = useRef(stops);
	stopsRef.current = stops;
	const lastFitRef = useRef<string | null>(null);

	const fitToRoute = useCallback((instance: MapboxMap, animate: boolean) => {
		const bounds = boundsOfStops(stopsRef.current);
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

	useEffect(() => {
		if (map === null || boundsOfStops(stops) === null) {
			return;
		}
		const key = fitKey ?? '';
		if (lastFitRef.current === key) {
			return;
		}
		lastFitRef.current = key;
		fitToRoute(map, true);
	}, [map, fitKey, stops, fitToRoute]);

	const handleZoom = useCallback(() => {
		if (map !== null) {
			fitToRoute(map, true);
		}
	}, [map, fitToRoute]);

	const hasMappedStops = features.length > 0;
	const hasUnmappedOnly = !hasMappedStops && stops.length > 0;

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
