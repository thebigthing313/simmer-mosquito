import { mapFamily } from '@simmer-mosquito/design-tokens';
import type { MapLegendEntry } from '../../components/map';
import { ACTIVITY_FAMILY_LABELS, type ActivityEntry } from '../-activity-data';

/**
 * The key, cut down to the families the day actually puts on the map.
 *
 * The four dots used to sit in the filter card beside a count apiece, which read
 * as a control and was not one. On the map they are what the pins mean, and a
 * family the day recorded nothing in draws no pin, so listing it would be a key
 * to something that is not there.
 *
 * Colours come from `mapFamily`, which is what the layer paints with, per
 * DESIGN.md's Legend Truth Rule.
 */
export function dailyWorkLegend(entries: readonly ActivityEntry[]): readonly MapLegendEntry[] {
	const present = new Set(entries.map((entry) => entry.family));
	return ACTIVITY_FAMILY_LABELS.filter(({ key }) => present.has(key)).map(({ key, label }) => ({
		color: mapFamily[key],
		label,
	}));
}
