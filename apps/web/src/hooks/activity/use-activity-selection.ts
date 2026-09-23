import type { Map as MapboxMap } from 'mapbox-gl';
import { useState } from 'react';
import type { ActivityEntry } from '../../components/activity/activity-data';
import { useFlyToSelection } from '../explorer/use-fly-to-selection';
import type { ActivityLayerConfig } from '../map/use-activity-layer';
import { type ActivityView, useActivityView } from './use-activity-view';

export interface ActivitySelection {
	readonly view: ActivityView;
	readonly selectedKey: string | null;
	readonly select: (key: string) => void;
	readonly clear: () => void;
	readonly onMapReady: (instance: MapboxMap) => void;
	readonly activityLayer: ActivityLayerConfig;
}

/**
 * The one selection an activity page's map and list both answer to: the
 * derived view, the selected key, and the layer config that draws it. The
 * map flies to what the list selected.
 */
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
		clear: () => setSelectedKey(null),
		onMapReady: (instance: MapboxMap) => setMap(instance),
		activityLayer: { data: view.mapData, selectedKey, onSelectFeature: setSelectedKey },
	};
}
