import type { GeoJSONSource, LayerSpecification, Map as MapboxMap, MapMouseEvent } from 'mapbox-gl';
import { useEffect, useRef } from 'react';
import { isMapLive } from './use-mapbox-map';

/**
 * One GeoJSON source and its layers, bound to a live Mapbox map.
 *
 * Six hooks wrote this sequence out longhand — the same five steps in the same
 * order with the same guards:
 *
 * 1. add the source, or `setData` on it if it is already there
 * 2. add each layer, skipping any the style already has
 * 3. do both again on `style.load`, because a basemap switch drops them
 * 4. push later data through `setData` rather than re-adding anything
 * 5. tear down layer-by-layer then source, each behind an existence check, the
 *    whole thing behind a `try` because the map may already be gone
 *
 * Step 3 is the one that matters and the one a careless extraction breaks,
 * because nothing looks wrong until somebody switches basemap. Step 5's `try`
 * is not defensive noise: `useMapboxMap`'s create-effect cleanup calls
 * `map.remove()` and, on unmount, runs *before* this hook's cleanup, so
 * touching the style afterwards throws. The `isMapLive` guard on the way in is
 * the same hazard from the other side — a map that was destroyed while this
 * subtree was hidden, handed straight back to the setup that follows.
 *
 * What stays with the caller is everything that makes a layer worth having —
 * its specs, its colour expressions, its feature model — and any effect that
 * re-scopes a layer without re-adding it, like a selection filter.
 */
export function useGeoJsonSource({
	map,
	isLoaded,
	sourceId,
	data,
	layers,
	sourceOptions,
	interactive,
	onEnsure,
}: {
	readonly map: MapboxMap | null;
	readonly isLoaded: boolean;
	readonly sourceId: string;
	/** `null` makes the hook a no-op: nothing is added and nothing torn down. */
	readonly data: GeoJSON.GeoJSON | null;
	/**
	 * The layers to add, in order. Called on every ensure rather than read once,
	 * so it may close over live values — a selected id, say — without the source
	 * being re-added when they change.
	 */
	readonly layers: () => readonly LayerSpecification[];
	/**
	 * Extra options for the source itself, applied only when it is created.
	 * `promoteId` is the one that matters: feature-state needs a stable feature
	 * id, and Mapbox will not take one from a GeoJSON string id.
	 */
	readonly sourceOptions?: { readonly promoteId?: string };
	/**
	 * Run after the source and layers are in place, on first add *and* on every
	 * restyle. A basemap switch wipes feature-state along with the layers, so
	 * anything held there has to be re-applied here or it silently disappears.
	 */
	readonly onEnsure?: () => void;
	/**
	 * Click and hover, for the layers that answer to a pointer. Omitting
	 * `onSelectFeature` leaves the map's own handlers untouched.
	 */
	readonly interactive?: {
		readonly layerIds: readonly string[];
		readonly onSelectFeature?: (id: string | null) => void;
	};
}): void {
	const enabled = data !== null;
	const isInteractive = interactive?.onSelectFeature !== undefined;

	// Everything the setup effect reads but must not re-run for. Re-adding the
	// source on a data change would drop and rebuild layers on every tick.
	const dataRef = useRef(data);
	dataRef.current = data;
	const layersRef = useRef(layers);
	layersRef.current = layers;
	const onEnsureRef = useRef(onEnsure);
	onEnsureRef.current = onEnsure;
	const sourceOptionsRef = useRef(sourceOptions);
	sourceOptionsRef.current = sourceOptions;
	const onSelectRef = useRef(interactive?.onSelectFeature);
	onSelectRef.current = interactive?.onSelectFeature;
	const interactiveLayerIdsRef = useRef(interactive?.layerIds ?? []);
	interactiveLayerIdsRef.current = interactive?.layerIds ?? [];

	// The ids actually added, so teardown removes what this hook put there even
	// if `layers()` would answer differently by then.
	const addedLayerIdsRef = useRef<readonly string[]>([]);

	useEffect(() => {
		if (!isMapLive(map) || !isLoaded || !enabled) {
			return;
		}
		const activeMap = map;

		function ensureLayers() {
			const current = dataRef.current;
			if (current === null) {
				return;
			}

			const source = activeMap.getSource(sourceId) as GeoJSONSource | undefined;
			if (source === undefined) {
				activeMap.addSource(sourceId, {
					type: 'geojson',
					data: current,
					...sourceOptionsRef.current,
				});
			} else {
				source.setData(current);
			}

			const specs = layersRef.current();
			for (const layer of specs) {
				if (activeMap.getLayer(layer.id) === undefined) {
					activeMap.addLayer(layer);
				}
			}
			addedLayerIdsRef.current = specs.map((layer) => layer.id);
			onEnsureRef.current?.();
		}

		ensureLayers();
		activeMap.on('style.load', ensureLayers);

		function presentInteractiveLayers(): string[] {
			return interactiveLayerIdsRef.current.filter((id) => activeMap.getLayer(id) !== undefined);
		}

		function handleClick(event: MapMouseEvent) {
			const present = presentInteractiveLayers();
			if (present.length === 0) {
				return;
			}
			const feature = activeMap.queryRenderedFeatures(event.point, { layers: present })[0];
			// Prefer the `id` property (a domain UUID); Mapbox does not preserve
			// string feature ids for GeoJSON sources, so `feature.id` may be
			// undefined. Fall back to the native id for sources keyed on a number.
			const rawId = feature?.properties?.id ?? feature?.id;
			onSelectRef.current?.(rawId === undefined || rawId === null ? null : String(rawId));
		}

		function handleMove(event: MapMouseEvent) {
			const present = presentInteractiveLayers();
			if (present.length === 0) {
				return;
			}
			const hovering = activeMap.queryRenderedFeatures(event.point, { layers: present }).length > 0;
			activeMap.getCanvas().style.cursor = hovering ? 'pointer' : '';
		}

		if (isInteractive) {
			activeMap.on('click', handleClick);
			activeMap.on('mousemove', handleMove);
		}

		return () => {
			activeMap.off('style.load', ensureLayers);
			if (isInteractive) {
				activeMap.off('click', handleClick);
				activeMap.off('mousemove', handleMove);
			}

			try {
				if (isInteractive) {
					activeMap.getCanvas().style.cursor = '';
				}
				for (const id of addedLayerIdsRef.current) {
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
			addedLayerIdsRef.current = [];
		};
	}, [map, isLoaded, enabled, isInteractive, sourceId]);

	// Data changes ride the existing source. A reconnect or restyle can run this
	// against a torn-down style, where `getSource` throws; the setup effect
	// re-seeds on `style.load`.
	useEffect(() => {
		if (!isMapLive(map) || !isLoaded || data === null) {
			return;
		}
		try {
			const source = map.getSource(sourceId) as GeoJSONSource | undefined;
			source?.setData(data);
		} catch {
			// Map style not available; nothing to update.
		}
	}, [map, isLoaded, sourceId, data]);
}
