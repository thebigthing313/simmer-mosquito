import type { Map as MapboxMap, MapMouseEvent, VectorTileSource } from 'mapbox-gl';
import { useEffect, useRef } from 'react';
import {
	buildRegionTileUrl,
	REGION_INTERACTIVE_LAYER_IDS,
	REGION_LAYER_IDS,
	REGION_SOURCE_ID,
	type RegionTileFilters,
	regionTileLayers,
} from './region-tiles';

export interface RegionTileLayerConfig {
	/** Base server URL the tile template is built against. */
	readonly serverUrl: string;
	/** Server-side filters folded into the tile request. */
	readonly filters?: RegionTileFilters;
	/** Region ids to draw; anything not listed stays hidden. Defaults to none. */
	readonly visibleIds?: readonly string[];
	/** Currently selected region id; drives the on-map highlight. */
	readonly selectedId?: string | null;
	/** Fired with a region id on feature click, or null when clicking empty map. */
	readonly onSelectFeature?: (id: string | null) => void;
}

const EMPTY_IDS: readonly string[] = [];

/**
 * Binds the region vector-tile source + layers to a live Mapbox map. Mirrors
 * {@link useHabitatTileLayer}: survives basemap restyles, pushes filter changes
 * through `setTiles`, keeps the selection highlight in sync, and routes clicks on
 * region polygons back out through `onSelectFeature`. A no-op when `config` is
 * undefined.
 */
export function useRegionTileLayer(
	map: MapboxMap | null,
	isLoaded: boolean,
	config: RegionTileLayerConfig | undefined,
): void {
	const enabled = config !== undefined;
	const url = enabled ? buildRegionTileUrl(config.serverUrl, config.filters) : null;
	const selectedId = config?.selectedId ?? null;
	const visibleIds = config?.visibleIds ?? EMPTY_IDS;
	// Stable key so the re-scope effect fires on membership changes, not identity.
	const visibleKey = [...visibleIds].sort().join(',');

	const urlRef = useRef(url);
	urlRef.current = url;
	const selectedRef = useRef(selectedId);
	selectedRef.current = selectedId;
	const visibleRef = useRef(visibleIds);
	visibleRef.current = visibleIds;
	const onSelectRef = useRef(config?.onSelectFeature);
	onSelectRef.current = config?.onSelectFeature;

	useEffect(() => {
		if (map === null || !isLoaded || !enabled) {
			return;
		}
		const activeMap = map;

		function ensureLayers() {
			const currentUrl = urlRef.current;
			if (currentUrl === null) {
				return;
			}
			if (activeMap.getSource(REGION_SOURCE_ID) === undefined) {
				activeMap.addSource(REGION_SOURCE_ID, {
					type: 'vector',
					tiles: [currentUrl],
					promoteId: 'id',
				});
			}
			for (const layer of regionTileLayers(selectedRef.current, visibleRef.current)) {
				if (activeMap.getLayer(layer.id) === undefined) {
					activeMap.addLayer(layer);
				}
			}
		}

		ensureLayers();
		activeMap.on('style.load', ensureLayers);

		function presentInteractiveLayers(): string[] {
			return REGION_INTERACTIVE_LAYER_IDS.filter((id) => activeMap.getLayer(id) !== undefined);
		}
		function handleClick(event: MapMouseEvent) {
			const layers = presentInteractiveLayers();
			if (layers.length === 0) {
				return;
			}
			const feature = activeMap.queryRenderedFeatures(event.point, { layers })[0];
			const id = feature === undefined || feature.id === undefined ? null : String(feature.id);
			onSelectRef.current?.(id);
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
			try {
				activeMap.getCanvas().style.cursor = '';
				for (const id of REGION_LAYER_IDS) {
					if (activeMap.getLayer(id) !== undefined) {
						activeMap.removeLayer(id);
					}
				}
				if (activeMap.getSource(REGION_SOURCE_ID) !== undefined) {
					activeMap.removeSource(REGION_SOURCE_ID);
				}
			} catch {
				// Map already removed; nothing left to clean up.
			}
		};
	}, [map, isLoaded, enabled]);

	// Push filter changes onto the existing source without re-adding layers.
	useEffect(() => {
		if (map === null || !isLoaded || url === null) {
			return;
		}
		const source = map.getSource(REGION_SOURCE_ID) as VectorTileSource | undefined;
		source?.setTiles?.([url]);
	}, [map, isLoaded, url]);

	// Re-apply every layer's filter when the visible set or selection changes, so
	// toggling a checkbox reveals/hides its region without re-adding layers.
	useEffect(() => {
		if (map === null || !isLoaded || !enabled) {
			return;
		}
		const ids = visibleKey.length === 0 ? [] : visibleKey.split(',');
		try {
			for (const layer of regionTileLayers(selectedId, ids)) {
				if (map.getLayer(layer.id) !== undefined && layer.filter !== undefined) {
					map.setFilter(layer.id, layer.filter);
				}
			}
		} catch {
			// Map style not available; nothing to re-scope.
		}
	}, [map, isLoaded, enabled, selectedId, visibleKey]);
}
