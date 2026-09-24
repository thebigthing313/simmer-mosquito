import type { GeoJsonGeometry } from '@simmer-mosquito/mapping';
import { sessionFetch } from '@simmer-mosquito/sync';
import { getServerUrl } from '../auth';

interface MissionItemGeometryRow {
	readonly id: string;
	readonly geojson: GeoJsonGeometry | null;
}

/**
 * Every stop's stored shape on a mission, from `/map/missions/:id/items`.
 *
 * The Electric shape for `mission_items` carries the centroid alone, so this is
 * the read for a stop's line or area. A mission the server does not know answers
 * no stops rather than a failure.
 */
export async function fetchMissionItemGeometry(
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
