import { LocateFixedIcon } from '@simmer-mosquito/ui-web/icons/registry';
import type { Map as MapboxMap } from 'mapbox-gl';
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { MapCanvas, type RouteStopFeature } from '../../../components/map';
import { MapControlButton, MapControlGroup } from '../../../components/map/map-control';

/**
 * The worklist map: numbered stops in sequence, auto-framed when the assignment
 * changes, with a manual reframe control. Selection and hover flow both ways
 * between here and the stop list through the layer's feature-state.
 *
 * Bounds come straight off the features rather than a domain view model, because
 * a stop's pin only ever needs its coordinates and its place in the order.
 */
export function AssignmentMap({
	features,
	stopCount,
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
	readonly selectedId?: string | null | undefined;
	readonly highlightId?: string | null | undefined;
	readonly onSelectStop?: ((id: string | null) => void) | undefined;
	readonly onHoverStop?: ((id: string | null) => void) | undefined;
	/** Auto-fit once per value (the assignment id); changing it reframes the map. */
	readonly fitKey?: string | undefined;
	readonly children?: ReactNode;
}) {
	const [map, setMap] = useState<MapboxMap | null>(null);
	const featuresRef = useRef(features);
	featuresRef.current = features;
	const lastFitRef = useRef<string | null>(null);

	const fitToAssignment = useCallback((instance: MapboxMap, animate: boolean) => {
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

	// Fit once per assignment, and only once coordinates have actually resolved —
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
		fitToAssignment(map, true);
	}, [map, fitKey, features, fitToAssignment]);

	const handleZoom = useCallback(() => {
		if (map !== null) {
			fitToAssignment(map, true);
		}
	}, [map, fitToAssignment]);

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
						<MapControlButton label="Zoom to assignment" onClick={handleZoom} side="right">
							<LocateFixedIcon aria-hidden="true" className="size-4" />
						</MapControlButton>
					</MapControlGroup>
				</div>
			) : null}

			{!hasMappedStops && stopCount > 0 ? (
				<div className="pointer-events-none absolute inset-x-0 top-4 flex justify-center">
					<span className="rounded-full border border-border/70 bg-background/85 px-3 py-1 text-muted-foreground text-xs shadow-sm backdrop-blur-sm">
						No mapped stops on this assignment yet
					</span>
				</div>
			) : null}
		</>
	);
}

/** SW/NE bounds across every located stop, or null when none has coordinates. */
function boundsOfFeatures(
	features: readonly RouteStopFeature[],
): [[number, number], [number, number]] | null {
	let west = Number.POSITIVE_INFINITY;
	let south = Number.POSITIVE_INFINITY;
	let east = Number.NEGATIVE_INFINITY;
	let north = Number.NEGATIVE_INFINITY;
	let count = 0;

	for (const feature of features) {
		west = Math.min(west, feature.lng);
		east = Math.max(east, feature.lng);
		south = Math.min(south, feature.lat);
		north = Math.max(north, feature.lat);
		count += 1;
	}

	return count === 0
		? null
		: [
				[west, south],
				[east, north],
			];
}
