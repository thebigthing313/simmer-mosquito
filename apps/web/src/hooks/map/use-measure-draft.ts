import { useSyncExternalStore } from 'react';
import type { MapMeasureController, Measurement } from './use-map-measure';
/**
 * Subscribes to the measurement in progress, so the component drawing the
 * number re-renders on every cursor move and the map does not.
 */
export function useMeasureDraft(controller: MapMeasureController): Measurement | null {
	const { subscribe, get } = controller.draft;
	return useSyncExternalStore(subscribe, get, get);
}
