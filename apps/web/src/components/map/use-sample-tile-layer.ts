import type { Map as MapboxMap, MapMouseEvent, VectorTileSource } from 'mapbox-gl';
import { useEffect, useRef } from 'react';
import {
	buildSampleTileUrl,
	SAMPLE_INTERACTIVE_LAYER_IDS,
	SAMPLE_LAYER_IDS,
	SAMPLE_SELECTED_LAYER_IDS,
	SAMPLE_SOURCE_ID,
	type SampleTileFilters,
	sampleTileLayers,
} from './sample-tiles';

export interface SampleTileLayerConfig {
	/** Base server URL the tile template is built against. */
	readonly serverUrl: string;
	/** Server-side filters folded into the tile request. */
	readonly filters?: SampleTileFilters;
	/** Currently selected sample id; drives the on-map highlight. */
	readonly selectedId?: string | null;
	/** Fired with a sample id on feature click, or null when clicking empty map. */
	readonly onSelectFeature?: (id: string | null) => void;
}

const selectedLayerIds = SAMPLE_SELECTED_LAYER_IDS as readonly string[];

/**
 * Binds the sample vector-tile source + layers to a live Mapbox map. Survives
 * basemap restyles (re-adds on `style.load`), pushes filter changes through
 * `setTiles` without re-adding layers, keeps the selection highlight in sync, and
 * routes clicks/hover on sample features back out through `onSelectFeature`. A
 * no-op when `config` is undefined. Mirrors {@link useInspectionTileLayer}.
 */
export function useSampleTileLayer(
	map: MapboxMap | null,
	isLoaded: boolean,
	config: SampleTileLayerConfig | undefined,
): void {
	const enabled = config !== undefined;
	const url = enabled ? buildSampleTileUrl(config.serverUrl, config.filters) : null;
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
			if (activeMap.getSource(SAMPLE_SOURCE_ID) === undefined) {
				activeMap.addSource(SAMPLE_SOURCE_ID, {
					type: 'vector',
					tiles: [currentUrl],
					promoteId: 'id',
				});
			}
			for (const layer of sampleTileLayers(selectedRef.current)) {
				if (activeMap.getLayer(layer.id) === undefined) {
					activeMap.addLayer(layer);
				}
			}
		}

		ensureLayers();
		// setStyle (basemap switch) wipes custom sources/layers — re-add when ready.
		activeMap.on('style.load', ensureLayers);

		function presentInteractiveLayers(): string[] {
			return SAMPLE_INTERACTIVE_LAYER_IDS.filter((id) => activeMap.getLayer(id) !== undefined);
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
				for (const id of SAMPLE_LAYER_IDS) {
					if (activeMap.getLayer(id) !== undefined) {
						activeMap.removeLayer(id);
					}
				}
				if (activeMap.getSource(SAMPLE_SOURCE_ID) !== undefined) {
					activeMap.removeSource(SAMPLE_SOURCE_ID);
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
		const source = map.getSource(SAMPLE_SOURCE_ID) as VectorTileSource | undefined;
		source?.setTiles?.([url]);
	}, [map, isLoaded, url]);

	// Re-scope the highlight layers to the selected feature.
	useEffect(() => {
		if (map === null || !isLoaded) {
			return;
		}
		for (const layer of sampleTileLayers(selectedId)) {
			if (selectedLayerIds.includes(layer.id) && map.getLayer(layer.id) !== undefined) {
				map.setFilter(layer.id, layer.filter);
			}
		}
	}, [map, isLoaded, selectedId]);
}
