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
import { MapFallback } from './map-fallback';
import { MapLayerControls } from './map-layer-controls';
import { MapSearch } from './map-search';
import { type BasemapId, DEFAULT_BASEMAP_ID, type MapCamera } from './map-styles';
import { MapZoomControls } from './map-zoom-controls';
import { buildOutreachExtentUrl } from './outreach-tiles';
import { buildRegionExtentUrl } from './region-tiles';
import { buildSampleExtentUrl } from './sample-tiles';
import { buildSourceReductionExtentUrl } from './source-reduction-tiles';
import { buildTrapExtentUrl } from './trap-tiles';
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
import { useMapboxMap } from './use-mapbox-map';
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
	geoJson,
	geoJsonInteraction,
	contextGeoJson,
	fitToData,
	onMapReady,
}: {
	readonly className?: string;
	readonly camera?: MapCamera;
	readonly controls?: MapControlsConfig;
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

	const show = {
		search: controls?.search ?? true,
		basemap: controls?.basemap ?? true,
		layers: controls?.layers ?? true,
		geolocate: controls?.geolocate ?? true,
		zoom: controls?.zoom ?? true,
		attribution: controls?.attribution ?? true,
	};

	const { map, isLoaded, hasToken, error } = useMapboxMap({
		container,
		basemapId,
		attribution: show.attribution,
		...(camera === undefined ? {} : { camera }),
	});

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
	// Before useGeoJsonLayer: Mapbox appends layers in add order and effects run
	// in hook order, so registering context first is what puts the record on top.
	useContextGeoJsonLayer(map, isLoaded, contextGeoJson ?? null);
	useGeoJsonLayer(map, isLoaded, geoJson ?? null, geoJsonInteraction);
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
	);

	const onMapReadyRef = useRef(onMapReady);
	onMapReadyRef.current = onMapReady;
	const readySignaledFor = useRef<MapboxMap | null>(null);
	useEffect(() => {
		if (map !== null && isLoaded && readySignaledFor.current !== map) {
			readySignaledFor.current = map;
			onMapReadyRef.current?.(map);
		}
		if (map === null) {
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
			<div className="absolute inset-0 size-full" ref={setContainer} />

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
							<div className="pointer-events-auto absolute top-4 left-4">
								<MapSearch map={map} />
							</div>
						) : null}
						{show.basemap || show.layers ? (
							<div className="pointer-events-auto absolute top-4 right-4 flex flex-col items-end gap-3">
								{show.basemap ? (
									<BasemapSwitcher onChange={setBasemapId} value={basemapId} />
								) : null}
								{show.layers ? <MapLayerControls /> : null}
							</div>
						) : null}
						{show.geolocate || show.zoom ? (
							// bottom-11 clears the attribution chip; without it, sit nearer the corner.
							<div
								className={cn(
									'pointer-events-auto absolute right-4 flex flex-col items-end gap-2',
									show.attribution ? 'bottom-11' : 'bottom-4',
								)}
							>
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
