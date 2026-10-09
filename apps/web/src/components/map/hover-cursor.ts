import type { GeoJSONFeature, Map as MapboxMap, MapMouseEvent } from 'mapbox-gl';

/** Returns the interactive layer ids a caller has on the map right now. */
type LayerProbe = () => readonly string[];

/** Receives the topmost feature hit on the caller's own layers, or `null`. */
type HoverListener = (feature: GeoJSONFeature | null) => void;

interface HoverRegistration {
	readonly probe: LayerProbe;
	readonly onHover: HoverListener | undefined;
}

interface HoverRegistry {
	readonly registrations: Set<HoverRegistration>;
	readonly handleMove: (event: MapMouseEvent) => void;
}

const registries = new WeakMap<MapboxMap, HoverRegistry>();

/**
 * Takes back a pointer this registry drew, and leaves any other cursor alone.
 *
 * A restyle takes every probed layer off the map, and the last probe can be
 * released while the cursor is over a feature; either way no later event would
 * clear the pointer. A crosshair belongs to a draw or measure session, which
 * restores its own cursor, so only `pointer` is cleared.
 */
function clearPointer(map: MapboxMap): void {
	try {
		const canvas = map.getCanvas();
		if (canvas.style.cursor === 'pointer') {
			canvas.style.cursor = '';
		}
	} catch {
		// Map already removed; nothing left to reset.
	}
}

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
 * A caller passing `onHover` is handed, on every move, the topmost feature of
 * that hit-test lying on one of its own layers, or `null` when none of them was
 * hit or none is on the map. It runs on the event rather than on the next
 * frame, because the draw hooks set their crosshair on the same event after
 * this handler and have to win. Returns the function that takes `probe` back
 * off.
 */
export function registerHoverLayers(
	map: MapboxMap,
	probe: LayerProbe,
	onHover?: HoverListener,
): () => void {
	let registry = registries.get(map);
	if (registry === undefined) {
		const registrations = new Set<HoverRegistration>();
		const handleMove = (event: MapMouseEvent) => {
			const probed = [...registrations].map((each) => ({ each, layers: each.probe() }));
			const layers = probed.flatMap(({ layers: own }) => own);
			if (layers.length === 0) {
				clearPointer(map);
				for (const { each } of probed) {
					each.onHover?.(null);
				}
				return;
			}
			const features = map.queryRenderedFeatures(event.point, { layers });
			map.getCanvas().style.cursor = features.length > 0 ? 'pointer' : '';
			for (const { each, layers: own } of probed) {
				if (each.onHover === undefined) {
					continue;
				}
				const hit = features.find((feature) => own.includes(feature.layer?.id ?? ''));
				each.onHover(hit ?? null);
			}
		};
		registry = { registrations, handleMove };
		registries.set(map, registry);
		map.on('mousemove', handleMove);
	}
	const active = registry;
	const registration: HoverRegistration = { probe, onHover };
	active.registrations.add(registration);

	return () => {
		active.registrations.delete(registration);
		if (active.registrations.size > 0) {
			return;
		}
		registries.delete(map);
		map.off('mousemove', active.handleMove);
		clearPointer(map);
	};
}
