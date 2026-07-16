import type { Map as MapboxMap, MapMouseEvent, VectorTileSource } from 'mapbox-gl';
import { useEffect, useRef } from 'react';
import {
	BIOCONTROL_INTERACTIVE_LAYER_IDS,
	BIOCONTROL_LAYER_IDS,
	BIOCONTROL_SELECTED_LAYER_IDS,
	BIOCONTROL_SOURCE_ID,
	type BiocontrolTileFilters,
	biocontrolTileLayers,
	buildBiocontrolTileUrl,
} from './biocontrol-tiles';

export interface BiocontrolTileLayerConfig {
	/** Base server URL the tile template is built against. */
	readonly serverUrl: string;
	/** Server-side filters folded into the tile request. */
	readonly filters?: BiocontrolTileFilters;
	/** Currently selected activity id; drives the on-map highlight. */
	readonly selectedId?: string | null;
	/** Fired with an activity id on feature click, or null when clicking empty map. */
	readonly onSelectFeature?: (id: string | null) => void;
}

const selectedLayerIds = BIOCONTROL_SELECTED_LAYER_IDS as readonly string[];

/**
 * Binds the biocontrol vector-tile source + layers to a live Mapbox map. Survives
 * basemap restyles (re-adds on `style.load`), pushes filter changes through
 * `setTiles` without re-adding layers, keeps the selection highlight in sync, and
 * routes clicks/hover on activity features back out through `onSelectFeature`.
 * A no-op when `config` is undefined. Mirrors {@link useChemicalTileLayer}.
 */
export function useBiocontrolTileLayer(
	map: MapboxMap | null,
	isLoaded: boolean,
	config: BiocontrolTileLayerConfig | undefined,
): void {
	const enabled = config !== undefined;
	const url = enabled ? buildBiocontrolTileUrl(config.serverUrl, config.filters) : null;
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
			if (activeMap.getSource(BIOCONTROL_SOURCE_ID) === undefined) {
				activeMap.addSource(BIOCONTROL_SOURCE_ID, {
					type: 'vector',
					tiles: [currentUrl],
					promoteId: 'id',
				});
			}
			for (const layer of biocontrolTileLayers(selectedRef.current)) {
				if (activeMap.getLayer(layer.id) === undefined) {
					activeMap.addLayer(layer);
				}
			}
		}

		ensureLayers();
		// setStyle (basemap switch) wipes custom sources/layers — re-add when ready.
		activeMap.on('style.load', ensureLayers);

		function presentInteractiveLayers(): string[] {
			return BIOCONTROL_INTERACTIVE_LAYER_IDS.filter((id) => activeMap.getLayer(id) !== undefined);
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
				for (const id of BIOCONTROL_LAYER_IDS) {
					if (activeMap.getLayer(id) !== undefined) {
						activeMap.removeLayer(id);
					}
				}
				if (activeMap.getSource(BIOCONTROL_SOURCE_ID) !== undefined) {
					activeMap.removeSource(BIOCONTROL_SOURCE_ID);
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
		const source = map.getSource(BIOCONTROL_SOURCE_ID) as VectorTileSource | undefined;
		source?.setTiles?.([url]);
	}, [map, isLoaded, url]);

	// Re-scope the highlight layers to the selected feature. Guarded by `enabled`
	// so maps without a biocontrol config never touch layers that were never added.
	useEffect(() => {
		if (map === null || !isLoaded || !enabled) {
			return;
		}
		try {
			for (const layer of biocontrolTileLayers(selectedId)) {
				if (selectedLayerIds.includes(layer.id) && map.getLayer(layer.id) !== undefined) {
					map.setFilter(layer.id, layer.filter);
				}
			}
		} catch {
			// Map style not available; nothing to re-scope.
		}
	}, [map, isLoaded, enabled, selectedId]);
}
