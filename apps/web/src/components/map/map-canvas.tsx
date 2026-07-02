import 'mapbox-gl/dist/mapbox-gl.css';
import { Loader2Icon } from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import type { Map as MapboxMap } from 'mapbox-gl';
import { useEffect, useRef, useState } from 'react';
import { BasemapSwitcher } from './basemap-switcher';
import { GeolocateControl } from './geolocate-control';
import { MapFallback } from './map-fallback';
import { MapLayerControls } from './map-layer-controls';
import { MapSearch } from './map-search';
import { type BasemapId, DEFAULT_BASEMAP_ID, type MapCamera } from './map-styles';
import { MapZoomControls } from './map-zoom-controls';
import { useGeoJsonLayer } from './use-geojson-layer';
import { type HabitatTileLayerConfig, useHabitatTileLayer } from './use-habitat-tile-layer';
import { useMapboxMap } from './use-mapbox-map';
import { type RouteLayerConfig, useRouteLayer } from './use-route-layer';

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
	routeLayer,
	geoJson,
	onMapReady,
}: {
	readonly className?: string;
	readonly camera?: MapCamera;
	readonly controls?: MapControlsConfig;
	/** Mount the habitat vector-tile layer with these filters + selection wiring. */
	readonly habitatLayer?: HabitatTileLayerConfig;
	/** Draw an ordered route: numbered stop pins + connecting path + selection sync. */
	readonly routeLayer?: RouteLayerConfig;
	/** Draw a single GeoJSON overlay (e.g. one record's geometry on a detail map). */
	readonly geoJson?: GeoJSON.GeoJSON | null;
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
	useRouteLayer(map, isLoaded, routeLayer);
	useGeoJsonLayer(map, isLoaded, geoJson ?? null);

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
					title="Map unavailable"
					variant="empty"
				/>
			) : showFatalError ? (
				<MapFallback description={error} title="The map didn't load" variant="error" />
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
