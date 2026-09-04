import type { BoundingBox } from '@simmer-mosquito/mapping';
import { Loader2Icon } from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import type { Map as MapboxMap } from 'mapbox-gl';
import { useEffect, useRef, useState } from 'react';
import { BasemapSwitcher } from './basemap-switcher';
import { GeolocateControl } from './geolocate-control';
import { MapContextMenu, type MapContextMenuConfig } from './map-context-menu';
import { MapFallback } from './map-fallback';
import { type MapInset, NO_MAP_INSET } from './map-inset';
import { MapLegend, type MapLegendEntry } from './map-legend';
import { MapReadout } from './map-readout';
import { MapSearch } from './map-search';
import { type BasemapId, DEFAULT_BASEMAP_ID, type MapCamera } from './map-styles';
import { MapZoomControls } from './map-zoom-controls';
import { MeasureControl, MeasureControlButton } from './measure-control';
import { NorthControl } from './north-control';
import { type MapTileLayer, tileLayerExtentUrl } from './tile-layers';
import { type ActivityLayerConfig, useActivityLayer } from './use-activity-layer';
import { useContextGeoJsonLayer } from './use-context-geojson-layer';
import { type GeoJsonLayerInteraction, useGeoJsonLayer } from './use-geojson-layer';
import { type MapExtentFitSource, useMapExtentFit } from './use-map-extent-fit';
import { useMapMeasure } from './use-map-measure';
import { useMapPadding } from './use-map-padding';
import { isMapLive, useMapboxMap } from './use-mapbox-map';
import { type NearbyLayerConfig, useNearbyLayer } from './use-nearby-layer';
import { type RouteLayerConfig, useRouteLayer } from './use-route-layer';
import { useTileLayer } from './use-tile-layer';

/**
 * Which on-map controls to render. Every control defaults to on; a consuming
 * route opts out of the ones it doesn't need — e.g. a habitat detail map turns
 * off `search` and `geolocate` to keep a focused, single-purpose surface.
 */
export interface MapControlsConfig {
	readonly search?: boolean;
	readonly basemap?: boolean;
	readonly geolocate?: boolean;
	readonly zoom?: boolean;
	/** Ephemeral distance/area tools. Off by default — see {@link MeasureControl}. */
	readonly measure?: boolean;
	/**
	 * Centre, bearing, zoom and scale along the bottom edge. Off by default: it
	 * belongs on a map that is the page, not on the small ones inside forms and
	 * cards, where it would take a quarter of the height. See {@link MapReadout}.
	 */
	readonly readout?: boolean;
	readonly attribution?: boolean;
}

/**
 * The map surface every map-bearing route draws on. Owns the GL instance and
 * basemap choice, then arranges the floating controls around the map without
 * crowding it: search, basemap switch, measure, geolocate, zoom. Routes choose
 * which controls appear through {@link MapControlsConfig}, and which records
 * draw through the `layers` list.
 */
export function MapCanvas({
	className,
	camera,
	controls,
	legend,
	inset,
	searchWidth,
	contextMenu,
	layers,
	routeLayer,
	nearbyLayer,
	activityLayer,
	geoJson,
	geoJsonInteraction,
	contextGeoJson,
	fitToData,
	onMapReady,
}: {
	readonly className?: string;
	readonly camera?: MapCamera;
	readonly controls?: MapControlsConfig;
	/**
	 * What the marks on this map mean, drawn under the basemap switcher. Pass only
	 * the entries the current filters can put on screen. See {@link MapLegend}.
	 */
	readonly legend?: readonly MapLegendEntry[] | undefined;
	/**
	 * What a page has floating over this canvas. The controls sit clear of it and
	 * the camera frames into what is left, so a full-page map with a results panel
	 * over it does not put its own chrome or a selected record underneath.
	 */
	readonly inset?: MapInset | undefined;
	/**
	 * Width in px for the place-search box, where the page stands it at the top of
	 * a column of its own chrome and the three want one edge.
	 */
	readonly searchWidth?: number | undefined;
	/**
	 * Give the map a right-click menu — the clicked coordinate, and the records
	 * this surface can start there. Omitted means no menu at all, which is what
	 * the maps embedded in forms and cards want: they already have a draw tool,
	 * and a second way to place a point would only compete with it.
	 */
	readonly contextMenu?: MapContextMenuConfig;
	/**
	 * The record tilesets this canvas draws, each with its own filters and
	 * selection wiring. Earlier entries are added first, so a later one draws over
	 * them; the GeoJSON overlays below are added after all of them. One entry per
	 * kind: a tileset is one GL source, and two entries naming the same one would
	 * be two configurations of it. See {@link MapTileLayer} for the kinds, and
	 * `tile-layers.ts` for what each one builds.
	 */
	readonly layers?: readonly MapTileLayer[];
	/** Draw an ordered route: numbered stop pins + connecting path + selection sync. */
	readonly routeLayer?: RouteLayerConfig;
	/** Draw a service-request proximity ring + center marker + family-colored nearby records. */
	readonly nearbyLayer?: NearbyLayerConfig;
	/** Draw one Profile's field work as a family-coloured pin cloud. */
	readonly activityLayer?: ActivityLayerConfig;
	/** Draw a single GeoJSON overlay (e.g. one record's geometry on a detail map). */
	readonly geoJson?: GeoJSON.GeoJSON | null;
	/** Opt into click-to-select + highlight on the GeoJSON overlay's features. */
	readonly geoJsonInteraction?: GeoJsonLayerInteraction;
	/**
	 * A quiet, non-interactive shape drawn *under* `geoJson` — the habitat a
	 * control action was performed against, and nothing an operator can click.
	 */
	readonly contextGeoJson?: GeoJSON.GeoJSON | null;
	/**
	 * Frame the data this canvas draws, on load and on every filter change. Pass
	 * `true` to fit the mounted tile layer's filtered extent (one request per
	 * filter set), or a {@link BoundingBox} for canvases whose features come from
	 * local rows. Panning and zooming afterwards are the user's to keep.
	 */
	readonly fitToData?: boolean | BoundingBox | null;
	/** Called once with the GL instance after it loads, for camera/bounds reads. */
	readonly onMapReady?: (map: MapboxMap) => void;
}) {
	const [container, setContainer] = useState<HTMLDivElement | null>(null);
	const [basemapId, setBasemapId] = useState<BasemapId>(DEFAULT_BASEMAP_ID);
	const [measureOpen, setMeasureOpen] = useState(false);
	const clear = inset ?? NO_MAP_INSET;

	const show = {
		search: controls?.search ?? true,
		basemap: controls?.basemap ?? true,
		geolocate: controls?.geolocate ?? true,
		zoom: controls?.zoom ?? true,
		// Opt-in rather than on by default: measuring is occasional, and a map
		// embedded in a form or a card has no room for another cluster.
		measure: controls?.measure ?? false,
		attribution: controls?.attribution ?? true,
		readout: controls?.readout ?? false,
	};

	const { map, isLoaded, hasToken, error } = useMapboxMap({
		container,
		basemapId,
		attribution: show.attribution,
		...(camera === undefined ? {} : { camera }),
	});

	const measure = useMapMeasure({ map, isLoaded: isLoaded && show.measure });

	// The tile layers are mounted as children (see TileLayerMount). Everything
	// here runs after them: Mapbox appends layers in add order and a child's
	// effects run before its parent's, so the route, the proximity ring, the
	// activity cloud and the two GeoJSON overlays all draw over the tiles.
	useRouteLayer(map, isLoaded, routeLayer);
	useNearbyLayer(map, isLoaded, nearbyLayer);
	useActivityLayer(map, isLoaded, activityLayer);
	// Before useGeoJsonLayer, for the same reason: registering context first is
	// what puts the record on top of it.
	useContextGeoJsonLayer(map, isLoaded, contextGeoJson ?? null);
	useGeoJsonLayer(map, isLoaded, geoJson ?? null, geoJsonInteraction);
	useMapPadding(map, isLoaded, clear);
	useMapExtentFit(map, isLoaded, resolveExtentFitSource(fitToData, layers), clear);

	const onMapReadyRef = useRef(onMapReady);
	onMapReadyRef.current = onMapReady;
	const readySignaledFor = useRef<MapboxMap | null>(null);
	useEffect(() => {
		// `isMapLive`, not `!== null`: a reconnect after a Suspense hide re-runs
		// this with the map it had before the hide, which no longer exists. Handing
		// that to a caller pushes the crash out into route code.
		if (isMapLive(map) && isLoaded && readySignaledFor.current !== map) {
			readySignaledFor.current = map;
			onMapReadyRef.current?.(map);
		}
		if (!isMapLive(map)) {
			readySignaledFor.current = null;
		}
	}, [map, isLoaded]);

	const showFatalError = hasToken && error !== null && !isLoaded;
	const showLoading = hasToken && error === null && !isLoaded;

	return (
		<div className={cn('relative size-full overflow-hidden bg-muted', className)}>
			{/*
			 * One child per entry, because React forbids a variable number of hook
			 * calls and `layers.map(useTileLayer)` is exactly that. They draw nothing
			 * of their own; mounting one adds its source and layers, unmounting one
			 * takes them away.
			 */}
			{(layers ?? []).map((layer) => (
				<TileLayerMount isLoaded={isLoaded} key={layer.kind} layer={layer} map={map} />
			))}
			{/*
			 * Explicit size-full (not just inset-0): Mapbox adds `.mapboxgl-map`,
			 * whose stylesheet sets `position: relative` and can win over Tailwind's
			 * `.absolute` by load order. Without an explicit height the container then
			 * collapses and the canvas renders but stays invisible.
			 */}
			{contextMenu === undefined ? (
				<div className="absolute inset-0 size-full" ref={setContainer} />
			) : (
				<MapContextMenu config={contextMenu} map={map}>
					<div className="absolute inset-0 size-full" ref={setContainer} />
				</MapContextMenu>
			)}

			{!hasToken ? (
				<MapFallback
					description="Set VITE_MAPBOX_ACCESS_TOKEN in the web app environment to load the basemap."
					title="Map Unavailable"
					variant="empty"
				/>
			) : showFatalError ? (
				<MapFallback description={error} title="The Map Didn't Load" variant="error" />
			) : (
				<>
					{showLoading ? (
						<div className="pointer-events-none absolute inset-x-0 top-4 flex justify-center">
							<span className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/85 px-3 py-1 text-muted-foreground text-xs shadow-sm backdrop-blur-sm">
								<Loader2Icon aria-hidden="true" className="size-3.5 animate-spin" />
								Loading map…
							</span>
						</div>
					) : null}

					<div className="pointer-events-none absolute inset-0">
						{show.search ? (
							// Fixed to the corner, never shifted by the inset. A page with a
							// panel down the left puts it *below* this box rather than beside
							// it, so a control that is reached for while typing a place name
							// does not move when the panel opens.
							<div className="pointer-events-auto absolute top-4 left-4">
								<MapSearch map={map} width={searchWidth} />
							</div>
						) : null}
						{show.basemap || legend !== undefined ? (
							<div
								className="pointer-events-auto absolute top-4 flex flex-col items-end gap-3"
								style={{ right: EDGE + clear.right }}
							>
								{show.basemap ? (
									<BasemapSwitcher onChange={setBasemapId} value={basemapId} />
								) : null}
								{legend === undefined ? null : <MapLegend entries={legend} />}
							</div>
						) : null}
						{show.readout ? (
							// Centred on the map the panels leave uncovered, not on the canvas,
							// and clear of both bottom corners: Mapbox puts its logo in one and
							// the attribution and info buttons in the other.
							<div
								className="pointer-events-none absolute flex justify-center"
								style={{
									left: EDGE + clear.left,
									right: EDGE + clear.right,
									bottom: EDGE + clear.bottom,
								}}
							>
								<MapReadout map={map} />
							</div>
						) : null}
						{show.measure || show.geolocate || show.zoom ? (
							// One right-edge stack, reading down in order of how often it is
							// reached for: measure, then locate, then zoom. It sits at the
							// middle of whatever strip of map the panels leave uncovered,
							// rather than in the corner, where Mapbox's own attribution and
							// info buttons live.
							<div
								className="pointer-events-none absolute flex items-center"
								style={{
									right: EDGE + clear.right,
									top: clear.top,
									bottom: clear.bottom,
								}}
							>
								<div className="pointer-events-auto flex flex-col items-end gap-2">
									{show.measure ? (
										<>
											{measureOpen ? (
												<MeasureControl
													controller={measure}
													onClose={() => {
														measure.clear();
														setMeasureOpen(false);
													}}
												/>
											) : null}
											<MeasureControlButton
												active={measureOpen}
												onClick={() => {
													// Closing takes the shapes with it: a measurement is a
													// question, and the answer does not outlive the asking.
													if (measureOpen) {
														measure.clear();
													}
													setMeasureOpen((open) => !open);
												}}
											/>
										</>
									) : null}
									{show.geolocate ? <GeolocateControl map={map} /> : null}
									{show.zoom ? (
										<>
											<MapZoomControls map={map} />
											<NorthControl map={map} />
										</>
									) : null}
								</div>
							</div>
						) : null}
					</div>
				</>
			)}
		</div>
	);
}

/** Gap (px) between a floating control group and the map edge, matching `*-4`. */
const EDGE = 16;

/** Holds one entry of the `layers` list on the map for as long as it is listed. */
function TileLayerMount({
	isLoaded,
	layer,
	map,
}: {
	readonly isLoaded: boolean;
	readonly layer: MapTileLayer;
	readonly map: MapboxMap | null;
}) {
	useTileLayer(map, isLoaded, layer);
	return null;
}

/**
 * Turn the `fitToData` prop into a frame source. An explicit box wins; `true`
 * frames the first listed layer, so the camera and the tiles read the same
 * filters and a canvas drawing several says which one it is framing.
 */
function resolveExtentFitSource(
	fitToData: boolean | BoundingBox | null | undefined,
	layers: readonly MapTileLayer[] | undefined,
): MapExtentFitSource | null {
	if (fitToData === undefined || fitToData === false) {
		return null;
	}
	if (fitToData !== true) {
		return { bounds: fitToData };
	}

	const first = layers?.[0];
	if (first === undefined) {
		return null;
	}
	const url = tileLayerExtentUrl(first);
	return url === null ? null : { url };
}
