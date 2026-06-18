import 'mapbox-gl/dist/mapbox-gl.css';
import { Loader2Icon } from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { useState } from 'react';
import { BasemapSwitcher } from './basemap-switcher';
import { GeolocateControl } from './geolocate-control';
import { MapFallback } from './map-fallback';
import { MapSearch } from './map-search';
import { type BasemapId, DEFAULT_BASEMAP_ID, type MapCamera } from './map-styles';
import { MapZoomControls } from './map-zoom-controls';
import { useMapboxMap } from './use-mapbox-map';

/**
 * The baseline full-bleed map surface for the GIS Data explorer. Owns the GL
 * instance and basemap choice, then arranges the floating controls — search,
 * basemap switch, geolocate, zoom — around the map without crowding it.
 */
export function MapCanvas({
	className,
	camera,
}: {
	readonly className?: string;
	readonly camera?: MapCamera;
}) {
	const [container, setContainer] = useState<HTMLDivElement | null>(null);
	const [basemapId, setBasemapId] = useState<BasemapId>(DEFAULT_BASEMAP_ID);
	const { map, isLoaded, hasToken, error } = useMapboxMap({
		container,
		basemapId,
		...(camera === undefined ? {} : { camera }),
	});

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
						<div className="pointer-events-auto absolute top-4 left-4">
							<MapSearch map={map} />
						</div>
						<div className="pointer-events-auto absolute top-4 right-4">
							<BasemapSwitcher onChange={setBasemapId} value={basemapId} />
						</div>
						<div className="pointer-events-auto absolute right-4 bottom-4 flex flex-col items-end gap-2">
							<GeolocateControl map={map} />
							<MapZoomControls map={map} />
						</div>
					</div>
				</>
			)}
		</div>
	);
}
