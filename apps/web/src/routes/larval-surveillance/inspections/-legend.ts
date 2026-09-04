import { LARVAL_DENSITIES, type LarvalDensity } from '@simmer-mosquito/domain';
import { densityLabel } from '../../../components/larval-display';
import {
	INSPECTION_DENSITY_COLORS,
	INSPECTION_DRY_COLOR,
	type MapLegendEntry,
} from '../../../components/map';

/** What the Water filter can be set to. Mirrors the segmented control's options. */
export type WetFilter = 'all' | 'wet' | 'dry';

/**
 * What a band reads as in the key.
 *
 * Everywhere else `none` is a density on a record that was already found to hold
 * water, and the record says so beside it. In the key there is nothing beside
 * it, and a dot labelled None sits next to one labelled Dry with nothing to tell
 * a reader that the first one is water with no larvae in it.
 */
function legendLabel(density: LarvalDensity): string {
	return density === 'none' ? 'Wet only' : densityLabel(density);
}

/**
 * The key, cut down to the colours the current filters can actually draw.
 *
 * The paint expression reads wetness first: a dry site is the neutral tone
 * whatever its density, and only a wet one is coloured by the density ramp. So
 * Water Dry paints one colour and no ramp, and a key that still listed five
 * densities would be describing dots that are not there.
 *
 * A density filter narrows the ramp the same way. With none set, every band can
 * appear, so all five are listed.
 */
export function inspectionLegend(
	wetness: WetFilter,
	densities: ReadonlySet<LarvalDensity>,
): readonly MapLegendEntry[] {
	const wet = wetness === 'dry' ? [] : shownDensities(densities);
	const dry = wetness === 'wet' ? [] : [{ color: INSPECTION_DRY_COLOR, label: 'Dry' }];
	return [...wet, ...dry];
}

/** The bands the density filter leaves on the map, in ramp order. */
function shownDensities(densities: ReadonlySet<LarvalDensity>): readonly MapLegendEntry[] {
	const shown =
		densities.size === 0 ? LARVAL_DENSITIES : LARVAL_DENSITIES.filter((d) => densities.has(d));
	return shown.map((density) => ({
		color: INSPECTION_DENSITY_COLORS[density],
		label: legendLabel(density),
	}));
}
