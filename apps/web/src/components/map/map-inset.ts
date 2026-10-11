import type { Map as MapboxMap } from 'mapbox-gl';

/**
 * How much of a map surface is covered by chrome floating over it.
 *
 * A full-page map with a results panel on top of it has two consumers of the
 * same fact, and they used to have no way to learn it. The map's own floating
 * controls need to sit clear of the panel, and the camera needs to put a flown-to
 * record in the part of the map a reader can actually see: `flyTo` centres on the
 * whole canvas, so a record selected from a panel lands underneath it.
 *
 * One value answers both. The frame that owns the panel derives it; the canvas
 * shifts its controls by it and passes it to the camera hooks.
 */
export interface MapInset {
	readonly top: number;
	readonly right: number;
	readonly bottom: number;
	readonly left: number;
}

/** A map with nothing over it. */
export const NO_MAP_INSET: MapInset = { top: 0, right: 0, bottom: 0, left: 0 };

/**
 * Mapbox camera padding: the map's own breathing room plus whatever is covering
 * it. `base` is what the call already wanted (0 for a fly-to, the fit margin for
 * a frame), and the inset is added on the sides that are obscured.
 */
export function insetPadding(
	base: number,
	inset: MapInset | undefined,
): {
	readonly top: number;
	readonly right: number;
	readonly bottom: number;
	readonly left: number;
} {
	const covered = inset ?? NO_MAP_INSET;
	return {
		top: base + covered.top,
		right: base + covered.right,
		bottom: base + covered.bottom,
		left: base + covered.left,
	};
}

/**
 * The inset each map's canvas last asked for, written by `useMapPadding`.
 *
 * Per map rather than per component, because a frame holds the map and not the
 * canvas. A weak map, so a removed map takes its entry with it.
 */
const requestedInsets = new WeakMap<MapboxMap, MapInset>();

/** Record the inset the canvas has asked this map to hold. Only `useMapPadding` calls it. */
export function requestCanvasInset(map: MapboxMap, inset: MapInset): void {
	requestedInsets.set(map, inset);
}

/**
 * The inset the canvas asked this map to hold, when the map holds something
 * else. Undefined when the padding is right or the canvas has asked for nothing.
 */
export function strayedCanvasInset(map: MapboxMap): MapInset | undefined {
	const requested = requestedInsets.get(map);
	if (requested === undefined) {
		return undefined;
	}
	const held = canvasPadding(map);
	const isHeld =
		held.top === requested.top &&
		held.right === requested.right &&
		held.bottom === requested.bottom &&
		held.left === requested.left;
	return isHeld ? undefined : requested;
}

/**
 * The padding options for a camera call that frames something: the inset plus
 * the call's own margin on every side, with `retainPadding: false`.
 *
 * The inset is the one the canvas asked for, unless the caller hands one over.
 * A map whose canvas has asked for nothing yet falls back to `getPadding()`.
 * `useMapPadding`'s heading in `docs/web-hooks.md` says why every fit goes
 * through this, and why `getPadding()` is not the first answer.
 */
export function framingPadding(
	map: MapboxMap,
	margin: number,
	inset: MapInset = requestedInsets.get(map) ?? canvasPadding(map),
): {
	readonly padding: ReturnType<typeof insetPadding>;
	readonly retainPadding: false;
} {
	return { padding: insetPadding(margin, inset), retainPadding: false };
}

/** The padding the map holds. Mapbox types every side optional and fills all four. */
function canvasPadding(map: MapboxMap): MapInset {
	const { top = 0, right = 0, bottom = 0, left = 0 } = map.getPadding();
	return { top, right, bottom, left };
}
