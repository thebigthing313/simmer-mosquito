import type { Map as MapboxMap, MapMouseEvent, VectorTileSource } from 'mapbox-gl';
import { useEffect, useRef } from 'react';
import {
	buildTrapTileUrl,
	TRAP_INTERACTIVE_LAYER_IDS,
	TRAP_LAYER_IDS,
	TRAP_SELECTED_LAYER_IDS,
	TRAP_SOURCE_ID,
	type TrapTileFilters,
	trapTileLayers,
} from './trap-tiles';

export interface TrapTileLayerConfig {
	/** Base server URL the tile template is built against. */
	readonly serverUrl: string;
	/** Server-side filters folded into the tile request. */
	readonly filters?: TrapTileFilters;
	/** Currently selected trap id; drives the on-map highlight. */
	readonly selectedId?: string | null;
	/** Fired with a trap id on feature click, or null when clicking empty map. */
	readonly onSelectFeature?: (id: string | null) => void;
}

const selectedLayerIds = TRAP_SELECTED_LAYER_IDS as readonly string[];

/**
 * Binds the trap vector-tile source + layers to a live Mapbox map. Survives
 * basemap restyles (re-adds on `style.load`), pushes filter changes through
 * `setTiles` without re-adding layers, keeps the selection highlight in sync, and
 * routes clicks/hover on trap features back out through `onSelectFeature`.
 * A no-op when `config` is undefined. Mirrors {@link useChemicalTileLayer}.
 */
export function useTrapTileLayer(
	map: MapboxMap | null,
	isLoaded: boolean,
	config: TrapTileLayerConfig | undefined,
): void {
	const enabled = config !== undefined;
	const url = enabled ? buildTrapTileUrl(config.serverUrl, config.filters) : null;
	const selectedId = config?.selectedId ?? null;

	const urlRef = useRef(url);
	urlRef.current = url;
	const selectedRef = useRef(selectedId);
	selectedRef.current = selectedId;
	const onSelectRef = useRef(config?.onSelectFeature);
	onSelectRef.current = config?.onSelectFeature;

	// Source + layers + interaction. Re-runs only on map identity / load / enable.
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
			if (activeMap.getSource(TRAP_SOURCE_ID) === undefined) {
				activeMap.addSource(TRAP_SOURCE_ID, {
					type: 'vector',
					tiles: [currentUrl],
					promoteId: 'id',
				});
			}
			for (const layer of trapTileLayers(selectedRef.current)) {
				if (activeMap.getLayer(layer.id) === undefined) {
					activeMap.addLayer(layer);
				}
			}
		}

		ensureLayers();
		// setStyle (basemap switch) wipes custom sources/layers — re-add when ready.
		activeMap.on('style.load', ensureLayers);

		function presentInteractiveLayers(): string[] {
			return TRAP_INTERACTIVE_LAYER_IDS.filter((id) => activeMap.getLayer(id) !== undefined);
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
			// useMapboxMap's create-effect cleanup calls map.remove() and, on unmount,
			// runs before this hook's cleanup — touching the canvas, style, sources, or
			// layers afterward throws. Guard the teardown.
			try {
				activeMap.getCanvas().style.cursor = '';
				for (const id of TRAP_LAYER_IDS) {
					if (activeMap.getLayer(id) !== undefined) {
						activeMap.removeLayer(id);
					}
				}
				if (activeMap.getSource(TRAP_SOURCE_ID) !== undefined) {
					activeMap.removeSource(TRAP_SOURCE_ID);
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
		const source = map.getSource(TRAP_SOURCE_ID) as VectorTileSource | undefined;
		source?.setTiles?.([url]);
	}, [map, isLoaded, url]);

	// Re-scope the highlight layers to the selected feature. Guarded by `enabled`
	// so maps without a trap config never touch layers that were never added.
	useEffect(() => {
		if (map === null || !isLoaded || !enabled) {
			return;
		}
		try {
			for (const layer of trapTileLayers(selectedId)) {
				if (selectedLayerIds.includes(layer.id) && map.getLayer(layer.id) !== undefined) {
					map.setFilter(layer.id, layer.filter);
				}
			}
		} catch {
			// Map style not available; nothing to re-scope.
		}
	}, [map, isLoaded, enabled, selectedId]);
}
