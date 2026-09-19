import { type MapLegendEntry, WEATHER_STATION_STATUS_COLORS } from '../../map';
/** What the Status filter can be set to. Mirrors the segmented control's options. */
export type StatusFilter = 'all' | 'active' | 'inactive';

/** The key, cut down to the colours the current filter can draw. */
export function weatherStationLegend(status: StatusFilter): readonly MapLegendEntry[] {
	const entries: MapLegendEntry[] = [];
	if (status !== 'inactive') {
		entries.push({ color: WEATHER_STATION_STATUS_COLORS.active, label: 'Active' });
	}
	if (status !== 'active') {
		entries.push({ color: WEATHER_STATION_STATUS_COLORS.inactive, label: 'Inactive' });
	}
	return entries;
}
