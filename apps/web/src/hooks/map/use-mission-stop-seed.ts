import { useState } from 'react';
import type { MissionStopGeometry } from '../operations/use-mission-stop-geometry';
import type { DrawGeometry } from './use-map-draw';

/**
 * Draw a mission stop's geometry once, on the first render that has it, and
 * answer that geometry for a later restore. `place` is only called while
 * `isEmpty`, so a shape placed before the stop arrived is kept.
 */
export function useMissionStopSeed(
	missionStop: MissionStopGeometry | null,
	isEmpty: boolean,
	place: (geometry: DrawGeometry) => void,
): DrawGeometry | null {
	const stopGeometry = missionStop?.status === 'ready' ? missionStop.geometry : null;
	const [seeded, setSeeded] = useState(false);
	// Adjusted during render rather than in an effect, so the first paint after
	// the stop arrives already draws it.
	if (stopGeometry !== null && !seeded) {
		setSeeded(true);
		if (isEmpty) {
			place(stopGeometry);
		}
	}
	return stopGeometry;
}
