import { type BoundingBox, boundsFromGeoJson } from '@simmer-mosquito/mapping';
import {
	type ActivityEntry,
	type ActivityFamilyGroup,
	activityEntryKey,
	buildActivityMapData,
	groupActivityByFamily,
} from '../../components/activity/activity-data';

/** What a page derives from one activity response. */
export interface ActivityView {
	readonly items: readonly ActivityEntry[];
	readonly families: readonly ActivityFamilyGroup[];
	readonly mapData: GeoJSON.FeatureCollection | null;
	/** The camera frame for the whole day, or null where there is nothing to frame. */
	readonly bounds: BoundingBox | null;
	readonly selected: ActivityEntry | null;
}

const NO_ENTRIES: readonly ActivityEntry[] = [];

/**
 * Everything a page derives from one activity response: the family groups,
 * the pin cloud, the camera frame over the whole set, and the entry
 * `selectedKey` names.
 */
export function useActivityView(
	items: readonly ActivityEntry[] | undefined,
	selectedKey: string | null,
): ActivityView {
	// A literal `?? []` here would be a new array every render, and every memo
	// below it would recompute on every render.
	const entries = items ?? NO_ENTRIES;
	return {
		items: entries,
		families: groupActivityByFamily(entries),
		mapData: buildActivityMapData(entries),
		// The camera frames the whole day's work as one MultiPoint, so a person who
		// covered two townships is not left half off the edge of the map.
		bounds:
			entries.length === 0
				? null
				: boundsFromGeoJson({
						type: 'MultiPoint',
						coordinates: entries.map((item) => [item.lng, item.lat]),
					}),
		selected: entries.find((item) => activityEntryKey(item) === selectedKey) ?? null,
	};
}
