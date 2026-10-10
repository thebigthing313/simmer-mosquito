import {
	type BoundingBox,
	boundsFromGeoJson,
	extendBounds,
	type LngLat,
} from '@simmer-mosquito/mapping';
import { LocateFixedIcon } from '@simmer-mosquito/ui-web/icons/registry';
import type { Map as MapboxMap } from 'mapbox-gl';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import type { RouteStopFeature } from '../../hooks/map/use-route-layer';
import { type RecordType, recordNoun } from '../../lib/record-nouns';
import { frameOnMap } from './map-camera';
import { MapCanvas } from './map-canvas';
import { MapControlButton, MapControlGroup } from './map-control';

/** The record types that are an ordered run of stops. */
type StopRunRecordType = Extract<RecordType, 'route' | 'mission' | 'assignment'>;

/**
 * The map for an ordered run of stops: a Route, a Mission or an Assignment.
 * It draws the numbered stops in sequence, frames them once per `fitKey` after
 * they resolve, and offers a control that frames them again. Selection and
 * hover flow both ways between here and the stop list through the layer's
 * feature-state. It takes the located stops as `features`, the count of every
 * stop as `stopCount`, and the record type, which reaches only the strings
 * through the noun register.
 */
export function StopSequenceMap({
	features,
	stopCount,
	recordType,
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
	/** Which run this is. Its noun comes from `lib/record-nouns.ts`. */
	readonly recordType: StopRunRecordType;
	readonly selectedId?: string | null | undefined;
	readonly highlightId?: string | null | undefined;
	readonly onSelectStop?: ((id: string | null) => void) | undefined;
	readonly onHoverStop?: ((id: string | null) => void) | undefined;
	/** Auto-fit once per value (the run's id); changing it reframes the map. */
	readonly fitKey?: string | undefined;
	/** Floating content layered over the map, such as a Route summary card. */
	readonly children?: ReactNode;
}) {
	const [map, setMap] = useState<MapboxMap | null>(null);
	const lastFitRef = useRef<string | null>(null);

	// Fit once per run, and only once coordinates have resolved: the stops
	// stream in separately, so an early fit would frame an empty set.
	useEffect(() => {
		const bounds = boundsOfFeatures(features);
		if (map === null || bounds === null) {
			return;
		}
		const key = fitKey ?? '';
		if (lastFitRef.current === key) {
			return;
		}
		lastFitRef.current = key;
		frameOnMap(map, bounds, { purpose: 'collection', animate: true });
	}, [map, fitKey, features]);

	const handleZoom = () => {
		if (map !== null) {
			frameOnMap(map, boundsOfFeatures(features), { purpose: 'collection', animate: true });
		}
	};

	const hasMappedStops = features.length > 0;

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
						<MapControlButton
							label={`Zoom to ${recordNoun(recordType).one}`}
							onClick={handleZoom}
							side="right"
						>
							<LocateFixedIcon aria-hidden="true" className="size-4" />
						</MapControlButton>
					</MapControlGroup>
				</div>
			) : null}

			{!hasMappedStops && stopCount > 0 ? (
				<div className="pointer-events-none absolute inset-x-0 top-4 flex justify-center">
					<span className="rounded-full border border-border/70 bg-background/85 px-3 py-1 text-muted-foreground text-xs shadow-sm backdrop-blur-sm">
						No mapped stops on this {recordNoun(recordType).one} yet
					</span>
				</div>
			) : null}
		</>
	);
}

/**
 * The bounds across every located stop, or null when none has coordinates.
 * A stop that owns a shape is framed by the whole shape rather than by the pin
 * at its centroid.
 */
function boundsOfFeatures(features: readonly RouteStopFeature[]): BoundingBox | null {
	let box: BoundingBox | null = null;
	for (const feature of features) {
		for (const point of framingPoints(feature)) {
			box = extendBounds(box, point);
		}
	}
	return box;
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
