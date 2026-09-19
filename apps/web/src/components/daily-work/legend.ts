import { mapFamily } from '@simmer-mosquito/design-tokens';
import { ACTIVITY_FAMILY_LABELS, type ActivityEntry } from '../activity/activity-data';
import type { MapLegendEntry } from '../map';
/**
 * The key, cut down to the families the day puts on the map. Colours come
 * from `mapFamily`, which is what the layer paints with, per DESIGN.md's
 * Legend Truth Rule.
 */
export function dailyWorkLegend(entries: readonly ActivityEntry[]): readonly MapLegendEntry[] {
	const present = new Set(entries.map((entry) => entry.family));
	return ACTIVITY_FAMILY_LABELS.filter(({ key }) => present.has(key)).map(({ key, label }) => ({
		color: mapFamily[key],
		label,
	}));
}
