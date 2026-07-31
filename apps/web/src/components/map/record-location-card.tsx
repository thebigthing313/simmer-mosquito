import {
	boundsFromGeoJson,
	centroidFromGeoJson,
	countGeoJsonVertices,
	formatGeometryTypeLabel,
	type GeoJsonGeometry,
} from '@simmer-mosquito/mapping';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import {
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@simmer-mosquito/ui-web/components/ui/card';
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from '@simmer-mosquito/ui-web/components/ui/empty';
import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from '@simmer-mosquito/ui-web/components/ui/tooltip';
import { LocateFixedIcon } from '@simmer-mosquito/ui-web/icons/registry';
import type { Map as MapboxMap } from 'mapbox-gl';
import { type ReactNode, useCallback, useEffect, useMemo, useRef } from 'react';
import { MapCanvas } from './map-canvas';
import type { MapCamera } from './map-styles';

/**
 * The "Location" card every record detail page shows.
 *
 * A detail page is scoped to one record, so it renders that record's **actual**
 * geometry — a polygon draws as a polygon, a line as a line. Only explorer
 * surfaces reduce geometry to a centroid marker, where a mix of shapes across
 * many records would read as noise.
 *
 * Geometry is not part of the Electric shape (ADR 0009): the synced row carries
 * only `lat`/`lng`/`geomType`. Callers fetch the full `geojson` from the record's
 * display endpoint (see `useOwnedGeometry`) and pass it here.
 */
export function RecordLocationCard({
	geojson,
	geomType,
	isPending = false,
	isError = false,
	title = 'Location',
	description,
	emptyTitle,
	emptyDescription,
	height = 'h-[320px]',
}: {
	readonly geojson: GeoJsonGeometry | null;
	readonly geomType: string | null;
	readonly isPending?: boolean;
	readonly isError?: boolean;
	/** Card heading; a boundary-shaped record may want its own noun. */
	readonly title?: string;
	/** Replaces the derived `Polygon · 12 vertices` line (e.g. with coordinates). */
	readonly description?: ReactNode;
	/** Heading for the no-geometry state. */
	readonly emptyTitle?: string;
	/** Shown when the record has no renderable geometry. */
	readonly emptyDescription: string;
	/** Tailwind height for the map well; override for denser layouts. */
	readonly height?: string;
}) {
	const bounds = useMemo(() => (geojson === null ? null : boundsFromGeoJson(geojson)), [geojson]);
	const centroid = useMemo(
		() => (geojson === null ? null : centroidFromGeoJson(geojson)),
		[geojson],
	);
	const camera = useMemo<MapCamera | undefined>(
		() => (centroid === null ? undefined : { center: [centroid.lng, centroid.lat], zoom: 15 }),
		[centroid],
	);

	// Framing runs both on map-ready and whenever the geometry changes, so a
	// late-arriving fetch still lands framed rather than on the default camera.
	const mapRef = useRef<MapboxMap | null>(null);
	const fitToBounds = useCallback(
		(map: MapboxMap, animate = false) => {
			if (bounds === null) {
				return;
			}
			const duration = animate ? 400 : 0;
			const hasArea = bounds.west !== bounds.east || bounds.south !== bounds.north;
			if (hasArea) {
				map.fitBounds(
					[
						[bounds.west, bounds.south],
						[bounds.east, bounds.north],
					],
					{ padding: 48, maxZoom: 17, duration },
				);
				return;
			}
			map.easeTo({ center: [bounds.west, bounds.south], zoom: 16, duration });
		},
		[bounds],
	);
	const handleMapReady = useCallback(
		(map: MapboxMap) => {
			mapRef.current = map;
			fitToBounds(map);
		},
		[fitToBounds],
	);
	useEffect(() => {
		if (mapRef.current !== null) {
			fitToBounds(mapRef.current);
		}
	}, [fitToBounds]);

	// Panning away is easy and there is no other landmark in a 320px well to
	// navigate back by, so the header keeps a way to return to the geometry.
	const recenter = useCallback(() => {
		if (mapRef.current !== null) {
			fitToBounds(mapRef.current, true);
		}
	}, [fitToBounds]);

	const hasMap = !isPending && geojson !== null;

	return (
		<Card className="overflow-hidden" variant="surface">
			<CardHeader className="px-4 py-4">
				<CardTitle>{title}</CardTitle>
				<CardDescription>
					{description ?? geometrySummary(geojson, geomType, isPending, isError)}
				</CardDescription>
				{hasMap ? (
					<CardAction>
						<Tooltip>
							<TooltipTrigger asChild>
								<Button aria-label="Recenter map" onClick={recenter} size="icon-sm" variant="ghost">
									<LocateFixedIcon aria-hidden="true" className="size-4" />
								</Button>
							</TooltipTrigger>
							<TooltipContent>Recenter on this record</TooltipContent>
						</Tooltip>
					</CardAction>
				) : null}
			</CardHeader>
			<CardContent padding="compact">
				{isPending ? (
					<Skeleton className={`w-full rounded-md ${height}`} />
				) : geojson === null ? (
					<Empty className="min-h-[220px] border border-border/40 bg-muted/30">
						<EmptyHeader>
							<EmptyTitle>
								{isError ? 'Geometry Unavailable' : (emptyTitle ?? 'No Geometry Recorded')}
							</EmptyTitle>
							<EmptyDescription>{emptyDescription}</EmptyDescription>
						</EmptyHeader>
					</Empty>
				) : (
					<div className={`overflow-hidden rounded-md border border-border/40 ${height}`}>
						<MapCanvas
							controls={{ search: false, layers: false, geolocate: false }}
							geoJson={geojson as unknown as GeoJSON.GeoJSON}
							onMapReady={handleMapReady}
							{...(camera === undefined ? {} : { camera })}
						/>
					</div>
				)}
			</CardContent>
		</Card>
	);
}

/** `Polygon · 12 vertices` — the stored type, not an assumed point. */
export function geometrySummary(
	geojson: GeoJsonGeometry | null,
	geomType: string | null,
	isPending = false,
	isError = false,
): string {
	if (isPending) {
		return 'Loading geometry…';
	}
	if (isError) {
		return 'Geometry could not be loaded';
	}
	if (geojson === null) {
		return 'No geometry recorded';
	}
	const label = formatGeometryTypeLabel(geomType ?? geojson.type);
	const vertices = countGeoJsonVertices(geojson);
	return `${label} · ${vertices} ${vertices === 1 ? 'vertex' : 'vertices'}`;
}
