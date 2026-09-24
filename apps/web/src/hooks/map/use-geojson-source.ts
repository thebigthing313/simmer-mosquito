import type { GeoJSONSource, LayerSpecification, Map as MapboxMap, MapMouseEvent } from 'mapbox-gl';
import { useEffect, useRef } from 'react';
import { type MapSourceGeoJson, toMapboxGeoJson } from '../../components/map/geojson-adapter';
import { registerHoverLayers } from '../../components/map/hover-cursor';
import { isMapLive } from './use-mapbox-map';

/**
 * Takes this source's layers and then the source itself back off the map.
 *
 * Module level rather than inline in the cleanup, because that loop sits inside
 * a try block and the React Compiler cannot lower a `for` there: one such loop
 * bails the whole hook, which compiles nothing (#856). The try stays at the
 * call site, since what it guards is a map that has already been removed.
 */
function removeAddedLayers(
	activeMap: MapboxMap,
	layerIds: readonly string[],
	sourceId: string,
): void {
	for (const id of layerIds) {
		if (activeMap.getLayer(id) !== undefined) {
			activeMap.removeLayer(id);
		}
	}
	if (activeMap.getSource(sourceId) !== undefined) {
		activeMap.removeSource(sourceId);
	}
}

/**
 * One GeoJSON source and its layers, bound to a live Mapbox map.
 *
 * Adds the source and each layer the style does not have, does both again on
 * `style.load`, pushes later `data` through `setData`, and tears down layers
 * then source on unmount. `onEnsure` runs after every add and re-add, which is
 * where a caller repaints anything it keeps outside `data`.
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
	/**
	 * `null` makes the hook a no-op: nothing is added and nothing torn down.
	 *
	 * Either vocabulary, converted by {@link toMapboxGeoJson} at the two points
	 * this hook hands a value to Mapbox. See `geojson-adapter.ts`.
	 */
	readonly data: MapSourceGeoJson | null;
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
	const layersRef = useRef(layers);
	const onEnsureRef = useRef(onEnsure);
	const sourceOptionsRef = useRef(sourceOptions);
	const onSelectRef = useRef(interactive?.onSelectFeature);
	const interactiveLayerIdsRef = useRef(interactive?.layerIds ?? []);
	// The writes are an effect rather than render-phase assignments, which is what
	// the React Compiler permits. Every read below happens after a commit, from an
	// effect or from a Mapbox or user event, so the value each one sees is unchanged.
	// The effect is declared above its readers, so the write lands first inside one
	// commit.
	useEffect(() => {
		dataRef.current = data;
		layersRef.current = layers;
		onEnsureRef.current = onEnsure;
		sourceOptionsRef.current = sourceOptions;
		onSelectRef.current = interactive?.onSelectFeature;
		interactiveLayerIdsRef.current = interactive?.layerIds ?? [];
	});

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

			const mapboxData = toMapboxGeoJson(current);
			const source = activeMap.getSource(sourceId) as GeoJSONSource | undefined;
			if (source === undefined) {
				activeMap.addSource(sourceId, {
					type: 'geojson',
					data: mapboxData,
					...sourceOptionsRef.current,
				});
			} else {
				source.setData(mapboxData);
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

		let releaseHover: (() => void) | null = null;
		if (isInteractive) {
			activeMap.on('click', handleClick);
			releaseHover = registerHoverLayers(activeMap, presentInteractiveLayers);
		}

		return () => {
			activeMap.off('style.load', ensureLayers);
			if (isInteractive) {
				activeMap.off('click', handleClick);
			}
			releaseHover?.();

			try {
				if (isInteractive) {
					activeMap.getCanvas().style.cursor = '';
				}
				removeAddedLayers(activeMap, addedLayerIdsRef.current, sourceId);
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
			if (source !== undefined) {
				source.setData(toMapboxGeoJson(data));
			}
		} catch {
			// Map style not available; nothing to update.
		}
	}, [map, isLoaded, sourceId, data]);
}
