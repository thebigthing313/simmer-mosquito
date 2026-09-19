import { LARVAL_DENSITIES, type LarvalDensity } from '@simmer-mosquito/domain';
import { densityLabel } from '../../larval-display';
import { INSPECTION_DENSITY_COLORS, INSPECTION_DRY_COLOR, type MapLegendEntry } from '../../map';
import type { WaterFilterValue } from '../inspections-search';

/**
 * What a band reads as in the key. `none` is water with no larvae in it, and
 * in the key there is nothing beside it to say so.
 */
function legendLabel(density: LarvalDensity): string {
	return density === 'none' ? 'Wet only' : densityLabel(density);
}

/**
 * The key, cut down to the colours the current filters can draw. The paint
 * expression reads wetness first, so Water Dry paints one colour and no ramp;
 * a density filter narrows the ramp the same way.
 */
export function inspectionLegend(
	wetness: WaterFilterValue,
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
