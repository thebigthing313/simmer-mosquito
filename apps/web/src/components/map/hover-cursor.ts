import type { Map as MapboxMap, MapMouseEvent } from 'mapbox-gl';

/** Returns the interactive layer ids a caller has on the map right now. */
type LayerProbe = () => readonly string[];

interface HoverRegistry {
	readonly probes: Set<LayerProbe>;
	readonly handleMove: (event: MapMouseEvent) => void;
}

const registries = new WeakMap<MapboxMap, HoverRegistry>();

/**
 * Shows the pointer cursor over any clickable feature on `map`, for every
 * layer registered here, from one `mousemove` handler per map.
 *
 * Each tile and GeoJSON layer used to run its own handler, so a map with five
 * layers ran five hit-tests per mouse event, and the last handler to run
 * decided the cursor: hovering a feature of the first layer drew the pointer
 * and the fifth layer's miss wiped it in the same event. One handler asks for
 * every registered layer in a single `queryRenderedFeatures`.
 *
 * It runs on the event rather than on the next frame, because the draw hooks
 * set their crosshair on the same event after this handler and have to win.
 * Returns the function that takes `probe` back off.
 */
export function registerHoverLayers(map: MapboxMap, probe: LayerProbe): () => void {
	let registry = registries.get(map);
	if (registry === undefined) {
		const probes = new Set<LayerProbe>();
		const handleMove = (event: MapMouseEvent) => {
			const layers = [...probes].flatMap((each) => each());
			if (layers.length === 0) {
				return;
			}
			const hovering = map.queryRenderedFeatures(event.point, { layers }).length > 0;
			map.getCanvas().style.cursor = hovering ? 'pointer' : '';
		};
		registry = { probes, handleMove };
		registries.set(map, registry);
		map.on('mousemove', handleMove);
	}
	const active = registry;
	active.probes.add(probe);

	return () => {
		active.probes.delete(probe);
		if (active.probes.size > 0) {
			return;
		}
		registries.delete(map);
		map.off('mousemove', active.handleMove);
	};
}
