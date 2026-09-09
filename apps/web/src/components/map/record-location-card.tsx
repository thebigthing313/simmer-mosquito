import { mapContext } from '@simmer-mosquito/design-tokens';
import {
	type BoundingBox,
	boundsFromGeoJson,
	centroidFromGeoJson,
	countGeoJsonVertices,
	extendBounds,
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
import { type ReactNode, useEffect, useRef } from 'react';
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
 *
 * A geometry the map will not draw is reported here rather than over the map,
 * because it is a fact about this record and a banner on the map would name a
 * problem the reader cannot point at. The caller resolves that sentence once,
 * where it read the geometry, and passes it as `unsupportedShape`. See
 * `checkOwnedGeometry` in `geojson-adapter.ts` (#761).
 *
 * A record worked *against* another feature — a control action performed at a
 * habitat — can pass that feature as `context`. It draws dashed and unfilled
 * beneath the record, is included in the framing, and is enough on its own to
 * render the map: an action that stored no geometry of its own still happened
 * somewhere, and "no geometry recorded" over a blank card was hiding a location
 * the record plainly knew.
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
	context,
	unsupportedShape = null,
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
	/** The surrounding feature this record was worked against, and its name. */
	readonly context?: RecordLocationContext | undefined;
	/**
	 * Why the map is drawing nothing: the record stores a shape its kind may not
	 * store. It replaces the summary line and the empty state's description, so it
	 * is read whether or not a `context` geometry keeps the map on screen.
	 */
	readonly unsupportedShape?: string | null;
}) {
	const contextGeojson = context?.geojson ?? null;
	const bounds = unionBounds(geojson, contextGeojson);
	const focus = geojson ?? contextGeojson;
	const centroid = focus === null ? null : centroidFromGeoJson(focus);
	const camera: MapCamera | undefined =
		centroid === null ? undefined : { center: [centroid.lng, centroid.lat], zoom: 15 };

	// Framing runs both on map-ready and whenever the geometry changes, so a
	// late-arriving fetch still lands framed rather than on the default camera.
	const mapRef = useRef<MapboxMap | null>(null);
	const handleMapReady = (map: MapboxMap) => {
		mapRef.current = map;
		fitToBounds(map, bounds);
	};
	useEffect(() => {
		if (mapRef.current !== null) {
			fitToBounds(mapRef.current, bounds);
		}
	}, [bounds]);

	// Panning away is easy and there is no other landmark in a 320px well to
	// navigate back by, so the header keeps a way to return to the geometry.
	const recenter = () => {
		if (mapRef.current !== null) {
			fitToBounds(mapRef.current, bounds, true);
		}
	};

	const hasMap = !isPending && focus !== null;

	return (
		<Card className="overflow-hidden" variant="surface">
			<CardHeader padding="compact">
				<CardTitle>{title}</CardTitle>
				<CardDescription>
					{unsupportedShape ??
						description ??
						derivedDescription({ context, contextGeojson, geojson, geomType, isError, isPending })}
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
				) : focus === null ? (
					<NothingToDraw
						emptyDescription={emptyDescription}
						emptyTitle={emptyTitle}
						isError={isError}
						unsupportedShape={unsupportedShape}
					/>
				) : (
					<div className="grid gap-2">
						<div className={`overflow-hidden rounded-md border border-border/40 ${height}`}>
							<MapCanvas
								contextGeoJson={contextGeojson}
								controls={{ search: false, geolocate: false }}
								geoJson={geojson}
								onMapReady={handleMapReady}
								{...(camera === undefined ? {} : { camera })}
							/>
						</div>
						{context === undefined || contextGeojson === null ? null : (
							<ContextLegend context={context} />
						)}
					</div>
				)}
			</CardContent>
		</Card>
	);
}

/**
 * The line under the heading when the caller passes none.
 *
 * Out of the component because it is the third branch of a chain that already
 * prefers `unsupportedShape` then `description`, and holding all three inline is
 * what took this file over the complexity gate.
 */
function derivedDescription({
	context,
	contextGeojson,
	geojson,
	geomType,
	isError,
	isPending,
}: {
	readonly context: RecordLocationContext | undefined;
	readonly contextGeojson: GeoJsonGeometry | null;
	readonly geojson: GeoJsonGeometry | null;
	readonly geomType: string | null;
	readonly isError: boolean;
	readonly isPending: boolean;
}): string {
	if (geojson === null && context !== undefined && contextGeojson !== null) {
		return `No geometry of its own, so it is shown at its ${context.kind.toLowerCase()}`;
	}
	return geometrySummary(geojson, geomType, isPending, isError);
}

/**
 * The well when there is no shape to put in it, which is three different states.
 *
 * A record that stores nothing is the ordinary one. A read that failed and a
 * shape the map will not draw are each their own heading, because "no geometry
 * recorded" is wrong about both and sends a reader looking for a record that
 * plainly has one.
 */
function NothingToDraw({
	emptyDescription,
	emptyTitle,
	isError,
	unsupportedShape,
}: {
	readonly emptyDescription: string;
	readonly emptyTitle: string | undefined;
	readonly isError: boolean;
	readonly unsupportedShape: string | null;
}) {
	return (
		<Empty className="min-h-[220px] border border-border/40 bg-muted/30">
			<EmptyHeader>
				<EmptyTitle>{emptyHeading({ emptyTitle, isError, unsupportedShape })}</EmptyTitle>
				<EmptyDescription>{unsupportedShape ?? emptyDescription}</EmptyDescription>
			</EmptyHeader>
		</Empty>
	);
}

function emptyHeading({
	emptyTitle,
	isError,
	unsupportedShape,
}: {
	readonly emptyTitle: string | undefined;
	readonly isError: boolean;
	readonly unsupportedShape: string | null;
}): string {
	if (isError) {
		return 'Geometry Unavailable';
	}
	if (unsupportedShape !== null) {
		return 'Geometry Not Drawn';
	}
	return emptyTitle ?? 'No Geometry Recorded';
}

/** The surrounding feature a record was worked against — today, its habitat. */
export interface RecordLocationContext {
	readonly geojson: GeoJsonGeometry | null;
	/** The record type of the surround, e.g. `Habitat`. */
	readonly kind: string;
	/** Its name, e.g. `Culvert 14`. */
	readonly name: string;
}

/**
 * Names the dashed shape. Per the legend truth rule in DESIGN.md the swatch
 * paints from the same constant the layer does, so it cannot drift into
 * describing a colour that is not on the map.
 */
function ContextLegend({ context }: { readonly context: RecordLocationContext }) {
	return (
		<p className="m-0 flex items-center gap-1.5 text-muted-foreground text-xs">
			<span
				aria-hidden="true"
				className="h-0 w-4 shrink-0 border-dashed border-t-2"
				style={{ borderColor: mapContext.outline }}
			/>
			<span className="truncate">
				{context.kind} · {context.name}
			</span>
		</p>
	);
}

/** Frame the record and its context together — the point is seeing one inside the other. */
/**
 * Frame a map on the record's geometry. It takes the bounds as an argument
 * rather than closing over them so the effect below can depend on the bounds
 * themselves, which is what changes when a late fetch lands.
 */
function fitToBounds(map: MapboxMap, bounds: BoundingBox | null, animate = false): void {
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
}

function unionBounds(
	geojson: GeoJsonGeometry | null,
	contextGeojson: GeoJsonGeometry | null,
): BoundingBox | null {
	let bounds: BoundingBox | null = null;
	for (const geometry of [geojson, contextGeojson]) {
		if (geometry === null) {
			continue;
		}
		const next = boundsFromGeoJson(geometry);
		if (next === null) {
			continue;
		}
		bounds = extendBounds(bounds, { lng: next.west, lat: next.south });
		bounds = extendBounds(bounds, { lng: next.east, lat: next.north });
	}
	return bounds;
}

/** `Polygon · 12 vertices` — the stored type, not an assumed point. */
function geometrySummary(
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
