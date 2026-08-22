import type { BoundingBox } from '@simmer-mosquito/mapping';
import { Loader2Icon } from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import type { Map as MapboxMap } from 'mapbox-gl';
import { useEffect, useRef, useState } from 'react';
import { buildAddressExtentUrl } from './address-tiles';
import { BasemapSwitcher } from './basemap-switcher';
import { buildBiocontrolExtentUrl } from './biocontrol-tiles';
import { buildChemicalExtentUrl } from './chemical-tiles';
import { buildCollectionExtentUrl } from './collection-tiles';
import { GeolocateControl } from './geolocate-control';
import { buildHabitatExtentUrl } from './habitat-tiles';
import { buildInspectionExtentUrl } from './inspection-tiles';
import { MapContextMenu, type MapContextMenuConfig } from './map-context-menu';
import { MapFallback } from './map-fallback';
import { type MapInset, NO_MAP_INSET } from './map-inset';
import { MapLayerControls } from './map-layer-controls';
import { MapSearch } from './map-search';
import { type BasemapId, DEFAULT_BASEMAP_ID, type MapCamera } from './map-styles';
import { MapZoomControls } from './map-zoom-controls';
import { MeasureControl, MeasureControlButton } from './measure-control';
import { buildOutreachExtentUrl } from './outreach-tiles';
import { buildRegionExtentUrl } from './region-tiles';
import { buildSampleExtentUrl } from './sample-tiles';
import { buildSourceReductionExtentUrl } from './source-reduction-tiles';
import { buildTrapExtentUrl } from './trap-tiles';
import { type ActivityLayerConfig, useActivityLayer } from './use-activity-layer';
import { type AddressTileLayerConfig, useAddressTileLayer } from './use-address-tile-layer';
import {
	type BiocontrolTileLayerConfig,
	useBiocontrolTileLayer,
} from './use-biocontrol-tile-layer';
import { type ChemicalTileLayerConfig, useChemicalTileLayer } from './use-chemical-tile-layer';
import {
	type CollectionTileLayerConfig,
	useCollectionTileLayer,
} from './use-collection-tile-layer';
import { useContextGeoJsonLayer } from './use-context-geojson-layer';
import { type GeoJsonLayerInteraction, useGeoJsonLayer } from './use-geojson-layer';
import { type HabitatTileLayerConfig, useHabitatTileLayer } from './use-habitat-tile-layer';
import {
	type InspectionTileLayerConfig,
	useInspectionTileLayer,
} from './use-inspection-tile-layer';
import { type MapExtentFitSource, useMapExtentFit } from './use-map-extent-fit';
import { useMapMeasure } from './use-map-measure';
import { useMapPadding } from './use-map-padding';
import { isMapLive, useMapboxMap } from './use-mapbox-map';
import { type NearbyLayerConfig, useNearbyLayer } from './use-nearby-layer';
import { type OutreachTileLayerConfig, useOutreachTileLayer } from './use-outreach-tile-layer';
import { type RegionTileLayerConfig, useRegionTileLayer } from './use-region-tile-layer';
import { type RouteLayerConfig, useRouteLayer } from './use-route-layer';
import { type SampleTileLayerConfig, useSampleTileLayer } from './use-sample-tile-layer';
import {
	type SourceReductionTileLayerConfig,
	useSourceReductionTileLayer,
} from './use-source-reduction-tile-layer';
import { type TrapTileLayerConfig, useTrapTileLayer } from './use-trap-tile-layer';

/**
 * Which on-map controls to render. Every control defaults to on; a consuming
 * route opts out of the ones it doesn't need — e.g. a habitat detail map turns
 * off `search` and `layers` to keep a focused, single-purpose surface.
 */
export interface MapControlsConfig {
	readonly search?: boolean;
	readonly basemap?: boolean;
	readonly layers?: boolean;
	readonly geolocate?: boolean;
	readonly zoom?: boolean;
	/** Ephemeral distance/area tools. Off by default — see {@link MeasureControl}. */
	readonly measure?: boolean;
	readonly attribution?: boolean;
}

/**
 * The baseline full-bleed map surface for the GIS Data explorer. Owns the GL
 * instance and basemap choice, then arranges the floating controls — search,
 * basemap switch, layers, geolocate, zoom — around the map without crowding it.
 * Routes choose which controls appear through {@link MapControlsConfig}.
 */
export function MapCanvas({
	className,
	camera,
	controls,
	inset,
	searchWidth,
	contextMenu,
	habitatLayer,
	regionLayer,
	addressLayer,
	inspectionLayer,
	sampleLayer,
	chemicalLayer,
	sourceReductionLayer,
	biocontrolLayer,
	outreachLayer,
	trapLayer,
	collectionLayer,
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
	/** Mount the habitat vector-tile layer with these filters + selection wiring. */
	readonly habitatLayer?: HabitatTileLayerConfig;
	/** Mount the region (polygon) vector-tile layer with these filters + selection wiring. */
	readonly regionLayer?: RegionTileLayerConfig;
	/** Mount the address (point) vector-tile layer with these filters + selection wiring. */
	readonly addressLayer?: AddressTileLayerConfig;
	/** Mount the inspection vector-tile layer with these filters + selection wiring. */
	readonly inspectionLayer?: InspectionTileLayerConfig;
	/** Mount the sample vector-tile layer with these filters + selection wiring. */
	readonly sampleLayer?: SampleTileLayerConfig;
	/** Mount the chemical-application vector-tile layer with filters + selection wiring. */
	readonly chemicalLayer?: ChemicalTileLayerConfig;
	/** Mount the source-reduction vector-tile layer with filters + selection wiring. */
	readonly sourceReductionLayer?: SourceReductionTileLayerConfig;
	/** Mount the biocontrol vector-tile layer with filters + selection wiring. */
	readonly biocontrolLayer?: BiocontrolTileLayerConfig;
	/** Mount the outreach vector-tile layer with filters + selection wiring. */
	readonly outreachLayer?: OutreachTileLayerConfig;
	/** Mount the trap vector-tile layer with filters + selection wiring. */
	readonly trapLayer?: TrapTileLayerConfig;
	/** Mount the collection vector-tile layer with filters + selection wiring. */
	readonly collectionLayer?: CollectionTileLayerConfig;
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
		layers: controls?.layers ?? true,
		geolocate: controls?.geolocate ?? true,
		zoom: controls?.zoom ?? true,
		// Opt-in rather than on by default: measuring is occasional, and a map
		// embedded in a form or a card has no room for another cluster.
		measure: controls?.measure ?? false,
		attribution: controls?.attribution ?? true,
	};

	const { map, isLoaded, hasToken, error } = useMapboxMap({
		container,
		basemapId,
		attribution: show.attribution,
		...(camera === undefined ? {} : { camera }),
	});

	const measure = useMapMeasure({ map, isLoaded: isLoaded && show.measure });

	useHabitatTileLayer(map, isLoaded, habitatLayer);
	useRegionTileLayer(map, isLoaded, regionLayer);
	useAddressTileLayer(map, isLoaded, addressLayer);
	useInspectionTileLayer(map, isLoaded, inspectionLayer);
	useSampleTileLayer(map, isLoaded, sampleLayer);
	useChemicalTileLayer(map, isLoaded, chemicalLayer);
	useSourceReductionTileLayer(map, isLoaded, sourceReductionLayer);
	useBiocontrolTileLayer(map, isLoaded, biocontrolLayer);
	useOutreachTileLayer(map, isLoaded, outreachLayer);
	useTrapTileLayer(map, isLoaded, trapLayer);
	useCollectionTileLayer(map, isLoaded, collectionLayer);
	useRouteLayer(map, isLoaded, routeLayer);
	useNearbyLayer(map, isLoaded, nearbyLayer);
	useActivityLayer(map, isLoaded, activityLayer);
	// Before useGeoJsonLayer: Mapbox appends layers in add order and effects run
	// in hook order, so registering context first is what puts the record on top.
	useContextGeoJsonLayer(map, isLoaded, contextGeoJson ?? null);
	useGeoJsonLayer(map, isLoaded, geoJson ?? null, geoJsonInteraction);
	useMapPadding(map, isLoaded, clear);
	useMapExtentFit(
		map,
		isLoaded,
		resolveExtentFitSource(fitToData, {
			habitatLayer,
			regionLayer,
			addressLayer,
			inspectionLayer,
			sampleLayer,
			chemicalLayer,
			sourceReductionLayer,
			biocontrolLayer,
			outreachLayer,
			trapLayer,
			collectionLayer,
		}),
		clear,
	);

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
						{show.basemap || show.layers ? (
							<div
								className="pointer-events-auto absolute top-4 flex flex-col items-end gap-3"
								style={{ right: EDGE + clear.right }}
							>
								{show.basemap ? (
									<BasemapSwitcher onChange={setBasemapId} value={basemapId} />
								) : null}
								{show.layers ? <MapLayerControls /> : null}
							</div>
						) : null}
						{show.measure || show.geolocate || show.zoom ? (
							// One bottom-right stack, reading down in order of how often it is
							// reached for: measure, then locate, then zoom. The taller offset
							// clears the attribution chip; without it, sit nearer the corner.
							<div
								className="pointer-events-auto absolute flex flex-col items-end gap-2"
								style={{
									right: EDGE + clear.right,
									bottom: bottomOffset(show.attribution, clear),
								}}
							>
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
								{show.zoom ? <MapZoomControls map={map} /> : null}
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
/** Taller, to clear the Mapbox attribution chip along the bottom. */
const ATTRIBUTION_EDGE = 44;

/** How far up a bottom control group sits, over the attribution chip and any chrome. */
function bottomOffset(hasAttribution: boolean, clear: MapInset): number {
	return (hasAttribution ? ATTRIBUTION_EDGE : EDGE) + clear.bottom;
}

/** The tile layers a canvas can frame, in the order a shared canvas resolves them. */
interface ExtentFitLayers {
	readonly habitatLayer: HabitatTileLayerConfig | undefined;
	readonly regionLayer: RegionTileLayerConfig | undefined;
	readonly addressLayer: AddressTileLayerConfig | undefined;
	readonly inspectionLayer: InspectionTileLayerConfig | undefined;
	readonly sampleLayer: SampleTileLayerConfig | undefined;
	readonly chemicalLayer: ChemicalTileLayerConfig | undefined;
	readonly sourceReductionLayer: SourceReductionTileLayerConfig | undefined;
	readonly biocontrolLayer: BiocontrolTileLayerConfig | undefined;
	readonly outreachLayer: OutreachTileLayerConfig | undefined;
	readonly trapLayer: TrapTileLayerConfig | undefined;
	readonly collectionLayer: CollectionTileLayerConfig | undefined;
}

/**
 * Turn the `fitToData` prop into a frame source. An explicit box wins; `true`
 * derives the extent endpoint from whichever tile layer is mounted, so the
 * camera always frames the same filters the tiles draw.
 */
function resolveExtentFitSource(
	fitToData: boolean | BoundingBox | null | undefined,
	layers: ExtentFitLayers,
): MapExtentFitSource | null {
	if (fitToData === undefined || fitToData === false) {
		return null;
	}
	if (fitToData !== true) {
		return { bounds: fitToData };
	}

	const url = resolveExtentUrl(layers);
	return url === null ? null : { url };
}

function resolveExtentUrl(layers: ExtentFitLayers): string | null {
	const {
		habitatLayer,
		regionLayer,
		addressLayer,
		inspectionLayer,
		sampleLayer,
		chemicalLayer,
		sourceReductionLayer,
		biocontrolLayer,
		outreachLayer,
		trapLayer,
		collectionLayer,
	} = layers;

	if (habitatLayer !== undefined) {
		return buildHabitatExtentUrl(habitatLayer.serverUrl, habitatLayer.filters);
	}
	if (regionLayer !== undefined) {
		// Regions stream whole and hide client-side, so only the ticked ones are
		// on screen — an empty set draws nothing and leaves the camera alone.
		const ids = regionLayer.visibleIds ?? [];
		return ids.length === 0
			? null
			: buildRegionExtentUrl(regionLayer.serverUrl, { ...regionLayer.filters, ids });
	}
	if (addressLayer !== undefined) {
		return buildAddressExtentUrl(addressLayer.serverUrl, addressLayer.filters);
	}
	if (inspectionLayer !== undefined) {
		return buildInspectionExtentUrl(inspectionLayer.serverUrl, inspectionLayer.filters);
	}
	if (sampleLayer !== undefined) {
		return buildSampleExtentUrl(sampleLayer.serverUrl, sampleLayer.filters);
	}
	if (chemicalLayer !== undefined) {
		return buildChemicalExtentUrl(chemicalLayer.serverUrl, chemicalLayer.filters);
	}
	if (sourceReductionLayer !== undefined) {
		return buildSourceReductionExtentUrl(
			sourceReductionLayer.serverUrl,
			sourceReductionLayer.filters,
		);
	}
	if (biocontrolLayer !== undefined) {
		return buildBiocontrolExtentUrl(biocontrolLayer.serverUrl, biocontrolLayer.filters);
	}
	if (outreachLayer !== undefined) {
		return buildOutreachExtentUrl(outreachLayer.serverUrl, outreachLayer.filters);
	}
	if (trapLayer !== undefined) {
		return buildTrapExtentUrl(trapLayer.serverUrl, trapLayer.filters);
	}
	if (collectionLayer !== undefined) {
		return buildCollectionExtentUrl(collectionLayer.serverUrl, collectionLayer.filters);
	}
	return null;
}
