/**
 * The one surface recipe every piece of chrome floating over a map wears:
 * translucent background, hairline border, and the blur that keeps text
 * readable over imagery.
 *
 * It lives on its own because the look was copied into the basemap switcher,
 * the zoom and layer controls, the place search, the measure readout and the
 * explorer panels, and five copies drift. Radius and shadow stay with the
 * caller: a control sits close to the map, a panel floats above it.
 *
 * `supports-[backdrop-filter]` is the fallback pair, not decoration. Without
 * blur the same alpha reads as a smear, so a browser that cannot blur gets a
 * more opaque surface instead.
 *
 * The alpha is set by contrast, not by taste. Whatever the surface lets through
 * composites into the background that the text on it is read against, and the
 * darkest thing under it is satellite imagery. Muted 12px text over a near-black
 * tile measures 3.81:1 at 0.75 and 4.40:1 at 0.85, both under the 4.5:1 floor.
 * At 0.90 it measures 4.93:1. Going back below that means darkening the muted
 * text inside these panels to match, not just moving the alpha.
 *
 * The border is at full strength and the ring is drawn in the ink rather than in
 * black. Over bright imagery, snow or sand or a white roof, the surface and the
 * map composite to within 1.4:1 of each other, so the hairline is the only thing
 * saying where the panel ends.
 */
export const MAP_CHROME_SURFACE =
	'border border-border bg-background/94 ring-1 ring-foreground/[0.06] backdrop-blur-sm supports-[backdrop-filter]:bg-background/90';
