import type {
	LayerSpecification,
	Map as MapboxMap,
	MapMouseEvent,
	VectorTileSource,
} from 'mapbox-gl';
import { useEffect, useRef } from 'react';
import { isMapLive } from './use-mapbox-map';

/**
 * Binding one vector tileset to a live Mapbox map.
 *
 * Ten explorers did this identically — habitats, traps, collections,
 * inspections, samples, addresses, chemical applications, source reduction,
 * biocontrol, outreach — in ten copies of the same 150 lines. What varied was
 * the tileset name and which module built the URL and the layers; everything
 * about the lifecycle was the same, including the two subtleties below, which is
 * exactly the kind of thing that survives in one copy and rots in the others.
 *
 * `use-region-tile-layer` deliberately does not use this: it adds a
 * `visibleIds` narrowing with its own re-render semantics.
 */

/** What one explorer passes in; the same shape for every tileset. */
export interface TileLayerConfig<TFilters> {
	/** Base server URL the tile template is built against. */
	readonly serverUrl: string;
	/** Server-side filters folded into the tile request. */
	readonly filters?: TFilters;
	/** Currently selected record id; drives the on-map highlight. */
	readonly selectedId?: string | null;
	/** Fired with a record id on feature click, or null when clicking empty map. */
	readonly onSelectFeature?: (id: string | null) => void;
}

/** What one tileset module supplies to make itself bindable. */
export interface TileLayerBinding<TFilters> {
	readonly sourceId: string;
	readonly buildTileUrl: (serverUrl: string, filters?: TFilters) => string;
	readonly buildLayers: (selectedId: string | null) => LayerSpecification[];
	/** Clickable layers, in hit priority. */
	readonly interactiveLayerIds: readonly string[];
	/** Every layer the tileset owns, for teardown. */
	readonly allLayerIds: readonly string[];
	/** The highlight layers, re-filtered when the selection changes. */
	readonly selectedLayerIds: readonly string[];
}

export function useTileLayer<TFilters>(
	map: MapboxMap | null,
	isLoaded: boolean,
	config: TileLayerConfig<TFilters> | undefined,
	binding: TileLayerBinding<TFilters>,
): void {
	const enabled = config !== undefined;
	const url = enabled ? binding.buildTileUrl(config.serverUrl, config.filters) : null;
	const selectedId = config?.selectedId ?? null;

	const urlRef = useRef(url);
	urlRef.current = url;
	const selectedRef = useRef(selectedId);
	selectedRef.current = selectedId;
	const onSelectRef = useRef(config?.onSelectFeature);
	onSelectRef.current = config?.onSelectFeature;
	// The binding is module-level and never changes identity in practice, but it
	// is read inside effects that must not re-run when it does.
	const bindingRef = useRef(binding);
	bindingRef.current = binding;

	// Source + layers + interaction. Re-runs only on map identity / load / enable.
	useEffect(() => {
		if (!isMapLive(map) || !isLoaded || !enabled) {
			return;
		}
		const activeMap = map;
		const { sourceId, interactiveLayerIds, allLayerIds } = bindingRef.current;

		function ensureLayers() {
			const currentUrl = urlRef.current;
			if (currentUrl === null) {
				return;
			}
			if (activeMap.getSource(sourceId) === undefined) {
				activeMap.addSource(sourceId, {
					type: 'vector',
					tiles: [currentUrl],
					promoteId: 'id',
				});
			}
			for (const layer of bindingRef.current.buildLayers(selectedRef.current)) {
				if (activeMap.getLayer(layer.id) === undefined) {
					activeMap.addLayer(layer);
				}
			}
		}

		ensureLayers();
		// setStyle (basemap switch) wipes custom sources/layers — re-add when ready.
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
				for (const id of allLayerIds) {
					if (activeMap.getLayer(id) !== undefined) {
						activeMap.removeLayer(id);
					}
				}
				if (activeMap.getSource(sourceId) !== undefined) {
					activeMap.removeSource(sourceId);
				}
			} catch {
				// Map already removed; nothing left to clean up.
			}
		};
	}, [map, isLoaded, enabled]);

	// Push filter changes onto the existing source without re-adding layers.
	useEffect(() => {
		if (!isMapLive(map) || !isLoaded || url === null) {
			return;
		}
		const source = map.getSource(bindingRef.current.sourceId) as VectorTileSource | undefined;
		source?.setTiles?.([url]);
	}, [map, isLoaded, url]);

	// Re-scope the highlight layers to the selected feature. Guarded by `enabled`
	// so maps without a config for this tileset never touch layers never added.
	useEffect(() => {
		if (!isMapLive(map) || !isLoaded || !enabled) {
			return;
		}
		const { buildLayers, selectedLayerIds } = bindingRef.current;
		try {
			for (const layer of buildLayers(selectedId)) {
				if (
					selectedLayerIds.includes(layer.id) &&
					map.getLayer(layer.id) !== undefined &&
					layer.filter !== undefined
				) {
					map.setFilter(layer.id, layer.filter);
				}
			}
		} catch {
			// Map style not available; nothing to re-scope.
		}
	}, [map, isLoaded, enabled, selectedId]);
}
