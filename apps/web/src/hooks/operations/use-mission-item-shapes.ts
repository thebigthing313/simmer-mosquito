import type { GeoJsonGeometry } from '@simmer-mosquito/mapping';
import { useQuery } from '@tanstack/react-query';
import { fetchMissionItemGeometry } from '../../lib/mission-item-geometry';

/**
 * Every stop's drawn shape on a mission, by mission item id, from the mission's
 * display endpoint. Refetched when a stop is redrawn, added or removed.
 */
export function useMissionItemShapes(
	missionId: string | null,
	items: readonly { readonly id: string; readonly updatedAt: Date }[],
): ReadonlyMap<string, GeoJsonGeometry> {
	const version = items
		.map((item) => `${item.id}:${item.updatedAt.getTime()}`)
		.sort()
		.join('|');

	const query = useQuery({
		queryKey: ['mission-item-geometry', missionId ?? 'none', version],
		queryFn: ({ signal }) =>
			missionId === null || items.length === 0
				? Promise.resolve([])
				: fetchMissionItemGeometry(missionId, signal),
		placeholderData: (previous) => previous,
		staleTime: Number.POSITIVE_INFINITY,
	});

	return new Map((query.data ?? []).map((row) => [row.id, row.geojson] as const));
}
