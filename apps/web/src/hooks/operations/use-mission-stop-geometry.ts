import { useQuery } from '@tanstack/react-query';
import { toDrawGeometry } from '../../components/map/draw-parts';
import { fetchMissionItemGeometry } from '../../lib/mission-item-geometry';
import type { DrawGeometry } from '../map/use-map-draw';

/**
 * The geometry of the mission stop a record form was opened from, as the form
 * sees it: still arriving, in hand, or failed with a way to ask again.
 */
export type MissionStopGeometry =
	| { readonly status: 'loading' }
	| { readonly status: 'ready'; readonly geometry: DrawGeometry }
	| { readonly status: 'error'; readonly retry: () => void };

/** Nothing fetches this key; it only keeps the disabled query's key well-formed. */
const NO_MISSION = 'none';

const noRetry = () => undefined;

/**
 * The stored geometry of one mission stop, from the mission's map read, or null
 * when the form was not opened from a stop. A stop the mission does not name,
 * or a stop link that names no mission, is a failure rather than an empty map.
 */
export function useMissionStopGeometry(search: {
	readonly missionId: string | null;
	readonly missionItemId: string | null;
}): MissionStopGeometry | null {
	const { missionId, missionItemId } = search;
	const query = useQuery({
		queryKey: ['mission-stop-geometry', missionId ?? NO_MISSION],
		queryFn: ({ signal }) =>
			missionId === null ? Promise.resolve([]) : fetchMissionItemGeometry(missionId, signal),
		enabled: missionId !== null && missionItemId !== null,
		staleTime: Number.POSITIVE_INFINITY,
	});

	if (missionItemId === null) {
		return null;
	}
	if (missionId === null) {
		return { status: 'error', retry: noRetry };
	}
	if (query.isError) {
		return { status: 'error', retry: () => void query.refetch() };
	}
	if (query.data === undefined) {
		return { status: 'loading' };
	}
	const row = query.data.find((item) => item.id === missionItemId);
	const geometry = row === undefined ? null : toDrawGeometry(row.geojson);
	if (geometry === null) {
		return { status: 'error', retry: () => void query.refetch() };
	}
	return { status: 'ready', geometry };
}
