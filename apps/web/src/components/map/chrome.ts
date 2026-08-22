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
 * darkest thing under it is satellite imagery. At 0.75 muted 12px text over a
 * dark tile measures 3.81:1, under the 4.5:1 floor; at 0.85 it measures 4.65:1.
 * Anything more translucent needs the text on it to darken to match.
 */
export const MAP_CHROME_SURFACE =
	'border border-border/70 bg-background/90 ring-1 ring-black/[0.03] backdrop-blur-sm supports-[backdrop-filter]:bg-background/85';
