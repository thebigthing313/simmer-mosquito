import { type BoundingBox, boundsFromGeoJson } from '@simmer-mosquito/mapping';
import type { Map as MapboxMap } from 'mapbox-gl';
import { useCallback, useMemo, useState } from 'react';
import { useFlyToSelection } from '../components/explorer';
import type { ActivityLayerConfig } from '../components/map/use-activity-layer';
import {
	type ActivityDayGroup,
	type ActivityEntry,
	activityEntryKey,
	buildActivityMapData,
	groupActivityByDay,
} from './-activity-data';

// What a page holding one Profile's field work derives from the response, and
// how the map and the list stay pointed at the same entry. Daily Work reads it
// over one day, and the response it reads is still a window's.
// Dash-prefixed so TanStack Router ignores this file as a route.

/**
 * The one selection the map and the list both answer to.
 *
 * A row and a pin are two views of the same entry, so picking either has to
 * move the other: the map flies to what the list selected, and the list
 * highlights what the map was clicked on. Keeping that in one hook is what
 * stops the two halves drifting into separate selections, which is how a card
 * ends up describing a record the map is not looking at.
 */
export interface ActivityView {
	readonly items: readonly ActivityEntry[];
	readonly days: readonly ActivityDayGroup[];
	readonly mapData: GeoJSON.FeatureCollection | null;
	/** The camera frame for the whole window, or null where there is nothing to frame. */
	readonly bounds: BoundingBox | null;
	readonly selected: ActivityEntry | null;
}

export interface ActivitySelection {
	readonly view: ActivityView;
	readonly selectedKey: string | null;
	readonly select: (key: string) => void;
	readonly clear: () => void;
	readonly onMapReady: (instance: MapboxMap) => void;
	readonly activityLayer: ActivityLayerConfig;
}

export function useActivitySelection(
	items: readonly ActivityEntry[] | undefined,
): ActivitySelection {
	const [map, setMap] = useState<MapboxMap | null>(null);
	const [selectedKey, setSelectedKey] = useState<string | null>(null);
	const view = useActivityView(items, selectedKey);

	// Keyed on the coordinates rather than the entry, so a refetch that hands
	// back an equal-but-new object does not re-fly the camera.
	useFlyToSelection(map, view.selected);

	return {
		view,
		selectedKey,
		select: setSelectedKey,
		clear: useCallback(() => setSelectedKey(null), []),
		onMapReady: useCallback((instance: MapboxMap) => setMap(instance), []),
		activityLayer: useMemo(
			() => ({ data: view.mapData, selectedKey, onSelectFeature: setSelectedKey }),
			[view.mapData, selectedKey],
		),
	};
}

/**
 * Everything a page derives from one activity response: the day groups, the pin
 * cloud, the camera frame, and which entry is selected.
 */
function useActivityView(
	items: readonly ActivityEntry[] | undefined,
	selectedKey: string | null,
): ActivityView {
	// A literal `?? []` here would be a new array every render, and every memo
	// below it would recompute on every render.
	const entries = items ?? NO_ENTRIES;
	return {
		items: entries,
		days: useMemo(() => groupActivityByDay(entries), [entries]),
		mapData: useMemo(() => buildActivityMapData(entries), [entries]),
		// The camera frames the whole day's work as one MultiPoint, so a person who
		// covered two townships is not left half off the edge of the map.
		bounds: useMemo(
			() =>
				entries.length === 0
					? null
					: boundsFromGeoJson({
							type: 'MultiPoint',
							coordinates: entries.map((item) => [item.lng, item.lat]),
						}),
			[entries],
		),
		selected: useMemo(
			() => entries.find((item) => activityEntryKey(item) === selectedKey) ?? null,
			[entries, selectedKey],
		),
	};
}

const NO_ENTRIES: readonly ActivityEntry[] = [];

/**
 * How much of the whole answer this response carries.
 *
 * `total` is what the server counted for the question, which is larger than the
 * list when the row cap bit; before a response arrives it is simply what is on
 * screen, so the header never claims a total it does not have.
 */
export function activityReach(
	response: { readonly total: number; readonly truncated: boolean } | undefined,
	shown: number,
): { readonly total: number; readonly truncated: boolean } {
	return response === undefined ? { total: shown, truncated: false } : response;
}
