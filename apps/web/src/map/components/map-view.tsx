import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { useMemo, useState } from 'react';
import 'mapbox-gl/dist/mapbox-gl.css';
import { useMapClickFeatures } from '../hooks/use-map-click-features';
import { useMapInstance } from '../hooks/use-map-instance';
import { useMapOverlays } from '../hooks/use-map-overlays';
import { useMapResize } from '../hooks/use-map-resize';
import type { GeoJsonSourceDefinition, MapViewProps, VectorTileSourceDefinition } from '../types';
import { MapControls } from './map-controls';
import { MapOverlayMenu } from './map-overlay-menu';
import { GeoJsonSourceBinding, VectorTileSourceBinding } from './map-source-bindings';
import { MapStatus } from './map-status';
import { MapboxSearchControl } from './mapbox-search-control';

export function MapView({
	camera,
	className,
	geoJsonSources = [],
	interactive = true,
	mapStyle,
	onFeatureClick,
	onMapReady,
	overlays = [],
	reuseKey,
	transformRequest,
	vectorTileSources = [],
}: MapViewProps) {
	const [container, setContainer] = useState<HTMLDivElement | null>(null);
	const { setOverlayVisible, visibility } = useMapOverlays(overlays);
	const nonFatalSourceIds = useMemo(
		() =>
			[...vectorTileSources, ...overlays.map((overlay) => overlay.source)].map(
				(source) => source.id,
			),
		[overlays, vectorTileSources],
	);
	const mapState = useMapInstance({
		container,
		interactive,
		...(camera === undefined ? {} : { camera }),
		...(mapStyle === undefined ? {} : { mapStyle }),
		nonFatalSourceIds,
		...(onMapReady === undefined ? {} : { onMapReady }),
		...(reuseKey === undefined ? {} : { reuseKey }),
		...(transformRequest === undefined ? {} : { transformRequest }),
	});

	useMapResize(mapState.map, container);

	const visibleOverlaySources = useMemo(
		() =>
			overlays
				.filter((overlay) => visibility[overlay.id] === true)
				.map((overlay) => overlay.source),
		[overlays, visibility],
	);

	const clickableLayerIds = useMemo(
		() => getLayerIds([...geoJsonSources, ...vectorTileSources, ...visibleOverlaySources]),
		[geoJsonSources, vectorTileSources, visibleOverlaySources],
	);

	useMapClickFeatures({
		layerIds: clickableLayerIds,
		map: mapState.map,
		...(onFeatureClick === undefined ? {} : { onFeatureClick }),
	});

	return (
		<section
			className={cn(
				'relative h-full min-h-96 w-full overflow-hidden rounded-md border bg-muted',
				'focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2',
				className,
			)}
		>
			<div className="absolute inset-0 h-full w-full" ref={setContainer} />
			{geoJsonSources.map((source) => (
				<GeoJsonSourceBinding
					isLoaded={mapState.isLoaded}
					key={source.id}
					map={mapState.map}
					source={source}
				/>
			))}
			{vectorTileSources.map((source) => (
				<VectorTileSourceBinding
					isLoaded={mapState.isLoaded}
					key={source.id}
					map={mapState.map}
					source={source}
				/>
			))}
			{visibleOverlaySources.map((source) => (
				<VectorTileSourceBinding
					isLoaded={mapState.isLoaded}
					key={source.id}
					map={mapState.map}
					source={source}
				/>
			))}
			<div className="pointer-events-none absolute inset-x-3 top-3 flex items-start justify-between gap-3">
				<div className="pointer-events-auto">
					{mapState.error !== null || !mapState.isLoaded ? (
						<MapStatus error={mapState.error} isLoaded={mapState.isLoaded} />
					) : (
						<MapboxSearchControl map={mapState.map} />
					)}
				</div>
				<div className="pointer-events-auto flex items-start gap-2">
					<MapOverlayMenu
						overlays={overlays}
						setOverlayVisible={setOverlayVisible}
						visibility={visibility}
					/>
					<MapControls map={mapState.map} />
				</div>
			</div>
		</section>
	);
}

function getLayerIds(
	sources: readonly (GeoJsonSourceDefinition | VectorTileSourceDefinition)[],
): readonly string[] {
	return sources.flatMap((source) => source.layers.map((layer) => layer.id));
}
