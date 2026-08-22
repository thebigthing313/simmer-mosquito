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
 */
export const MAP_CHROME_SURFACE =
	'border border-border/70 bg-background/85 ring-1 ring-black/[0.03] backdrop-blur-sm supports-[backdrop-filter]:bg-background/75';
