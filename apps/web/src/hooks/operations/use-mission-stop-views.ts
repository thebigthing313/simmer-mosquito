import {
	type MissionStopView,
	missionProgressCounts,
	toMissionStop,
} from '../../routes/operations/-operations-data';
import type { MissionProgressCounts } from '../queries/operations-view';
import { useMissionStops } from '../queries/use-mission-stops';
import { useMissionItemShapes } from './use-mission-item-shapes';

/**
 * A mission's stops, joined to whatever names them and to the shapes they were
 * drawn as, with their ordinals and the mission's progress counts.
 */
export function useMissionStopViews(missionId: string | null): {
	readonly stops: readonly MissionStopView[];
	readonly counts: MissionProgressCounts;
	readonly isLoading: boolean;
} {
	const { stops: rows, isLoading, isReady } = useMissionStops(missionId);
	const shapeById = useMissionItemShapes(missionId, rows);

	const stops: readonly MissionStopView[] = rows.map((row, index) =>
		toMissionStop(row, index, shapeById, isReady),
	);

	const counts = missionProgressCounts(stops);

	return { stops, counts, isLoading };
}
