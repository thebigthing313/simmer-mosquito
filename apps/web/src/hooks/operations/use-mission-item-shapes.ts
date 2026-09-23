import type { GeoJsonGeometry } from '@simmer-mosquito/mapping';
import { sessionFetch } from '@simmer-mosquito/sync';
import { useQuery } from '@tanstack/react-query';
import { getServerUrl } from '../../auth';

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

interface MissionItemGeometryRow {
	readonly id: string;
	readonly geojson: GeoJsonGeometry | null;
}

async function fetchMissionItemGeometry(
	missionId: string,
	signal: AbortSignal,
): Promise<readonly { readonly id: string; readonly geojson: GeoJsonGeometry }[]> {
	const url = new URL(`/map/missions/${missionId}/items`, getServerUrl());
	const response = await sessionFetch(url, { signal });
	if (response.status === 404) {
		return [];
	}
	if (!response.ok) {
		throw new Error(`Mission stop geometry request failed with ${response.status}`);
	}

	const body = (await response.json()) as {
		readonly missionItems?: readonly MissionItemGeometryRow[];
	};
	return (body.missionItems ?? []).flatMap((row) =>
		row.geojson === null ? [] : [{ id: row.id, geojson: row.geojson }],
	);
}
