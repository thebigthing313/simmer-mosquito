import type { LarvalDensity } from '@simmer-mosquito/domain';
import { densityLabel } from '../../../components/larval-display';
import {
	INSPECTION_DENSITY_COLORS,
	INSPECTION_DRY_COLOR,
	type MapLegendEntry,
} from '../../../components/map';

/** What the Water filter can be set to. Mirrors the segmented control's options. */
export type WetFilter = 'all' | 'wet' | 'dry';

const DENSITY_ORDER: readonly LarvalDensity[] = ['none', 'light', 'medium', 'heavy', 'very_heavy'];

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
	const entries: MapLegendEntry[] = [];
	if (wetness !== 'dry') {
		for (const density of DENSITY_ORDER) {
			if (densities.size === 0 || densities.has(density)) {
				entries.push({
					color: INSPECTION_DENSITY_COLORS[density] ?? INSPECTION_DRY_COLOR,
					label: densityLabel(density),
				});
			}
		}
	}
	if (wetness !== 'wet') {
		entries.push({ color: INSPECTION_DRY_COLOR, label: 'Dry' });
	}
	return entries;
}
