import type { Map as MapboxMap, MapMouseEvent, VectorTileSource } from 'mapbox-gl';
import { useEffect, useRef } from 'react';
import { type MapTileLayer, tileLayerBinding, tileLayerFilterKey } from './tile-layers';
import { isMapLive } from './use-mapbox-map';

/**
 * Binding one vector tileset to a live Mapbox map.
 *
 * Eleven explorers did this identically, in eleven copies of the same 150 lines:
 * habitats, regions, traps, collections, inspections, samples, addresses,
 * chemical applications, source reduction, biocontrol, outreach. What varied was
 * the tileset name and which module built the URL and the layers; everything
 * about the lifecycle was the same, including the two subtleties below, which is
 * exactly the kind of thing that survives in one copy and rots in the others.
 *
 * What each tileset supplies is one row of `tile-layers.ts`.
 */
export function useTileLayer(
	map: MapboxMap | null,
	isLoaded: boolean,
	layer: MapTileLayer | undefined,
): void {
	const enabled = layer !== undefined;
	const url = layer === undefined ? null : tileLayerBinding(layer).buildTileUrl(layer);
	const filterKey = layer === undefined ? '' : tileLayerFilterKey(layer);

	const layerRef = useRef(layer);
	layerRef.current = layer;
	const urlRef = useRef(url);
	urlRef.current = url;

	// Source + layers + interaction. Re-runs only on map identity / load / enable.
	useEffect(() => {
		const active = layerRef.current;
		if (!isMapLive(map) || !isLoaded || !enabled || active === undefined) {
			return;
		}
		const activeMap = map;
		const { sourceId, interactiveLayerIds, allLayerIds, buildLayers } = tileLayerBinding(active);

		function ensureLayers() {
			const currentUrl = urlRef.current;
			const currentLayer = layerRef.current;
			if (currentUrl === null || currentLayer === undefined) {
				return;
			}
			if (activeMap.getSource(sourceId) === undefined) {
				activeMap.addSource(sourceId, {
					type: 'vector',
					tiles: [currentUrl],
					promoteId: 'id',
				});
			}
			for (const spec of buildLayers(currentLayer)) {
				if (activeMap.getLayer(spec.id) === undefined) {
					activeMap.addLayer(spec);
				}
			}
		}

		ensureLayers();
		// setStyle (basemap switch) wipes custom sources/layers, so re-add on ready.
		activeMap.on('style.load', ensureLayers);

		function presentInteractiveLayers(): string[] {
			return interactiveLayerIds.filter((id) => activeMap.getLayer(id) !== undefined);
		}
		function handleClick(event: MapMouseEvent) {
			const layers = presentInteractiveLayers();
			if (layers.length === 0) {
				return;
			}
			const feature = activeMap.queryRenderedFeatures(event.point, { layers })[0];
			const id = feature === undefined || feature.id === undefined ? null : String(feature.id);
			layerRef.current?.onSelectFeature?.(id);
		}
		function handleMove(event: MapMouseEvent) {
			const layers = presentInteractiveLayers();
			if (layers.length === 0) {
				return;
			}
			const hovering = activeMap.queryRenderedFeatures(event.point, { layers }).length > 0;
			activeMap.getCanvas().style.cursor = hovering ? 'pointer' : '';
		}
		activeMap.on('click', handleClick);
		activeMap.on('mousemove', handleMove);

		return () => {
			activeMap.off('style.load', ensureLayers);
			activeMap.off('click', handleClick);
			activeMap.off('mousemove', handleMove);
			teardown(activeMap, sourceId, allLayerIds);
		};
	}, [map, isLoaded, enabled]);

	// Push filter changes onto the existing source without re-adding layers.
	useEffect(() => {
		const active = layerRef.current;
		if (!isMapLive(map) || !isLoaded || url === null || active === undefined) {
			return;
		}
		const { sourceId } = tileLayerBinding(active);
		const source = map.getSource(sourceId) as VectorTileSource | undefined;
		source?.setTiles?.([url]);
	}, [map, isLoaded, url]);

	// Re-scope what is drawn: the selection highlight for every tileset, and for
	// Regions the ticked set its base layers are filtered by. Guarded by `enabled`
	// so a map without this tileset never touches layers it never added.
	// biome-ignore lint/correctness/useExhaustiveDependencies: filterKey is the change key for the ref-read layer.
	useEffect(() => {
		const active = layerRef.current;
		if (!isMapLive(map) || !isLoaded || !enabled || active === undefined) {
			return;
		}
		applyLayerFilters(map, active);
	}, [map, isLoaded, enabled, filterKey]);
}

/** Point every layer this tileset owns at the filters it should now be drawing. */
function applyLayerFilters(map: MapboxMap, layer: MapTileLayer): void {
	try {
		for (const spec of tileLayerBinding(layer).buildLayers(layer)) {
			if (map.getLayer(spec.id) !== undefined && spec.filter !== undefined) {
				map.setFilter(spec.id, spec.filter);
			}
		}
	} catch {
		// Map style not available; nothing to re-scope.
	}
}

/**
 * Take the source and its layers off the map.
 *
 * `useMapboxMap`'s create-effect cleanup calls `map.remove()` and, on unmount,
 * runs before this hook's cleanup, after which touching the canvas, style,
 * sources or layers throws. So the whole teardown is guarded.
 */
function teardown(map: MapboxMap, sourceId: string, layerIds: readonly string[]): void {
	try {
		map.getCanvas().style.cursor = '';
		for (const id of layerIds) {
			if (map.getLayer(id) !== undefined) {
				map.removeLayer(id);
			}
		}
		if (map.getSource(sourceId) !== undefined) {
			map.removeSource(sourceId);
		}
	} catch {
		// Map already removed; nothing left to clean up.
	}
}
