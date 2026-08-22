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
