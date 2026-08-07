import { type Kysely, sql } from 'kysely';

import type { GeoJsonGeometry, SimmerDatabase } from '../index.js';

// --- mission dispatch map surfaces ------------------------------------------
//
// A mission's stops own Point/LineString/Polygon geometry the same way a
// requested control action does, but the Electric shape streams only their
// centroids (ADR 0009) — enough to plot a marker, not enough to draw the ditch
// run or the block a crew was sent to. A mission map that read the shape from
// sync would silently flatten every line and area to a dot.
//
// So this is a by-mission geometry read rather than the usual tile/list/by-id
// trio: one request returns every stop's shape in dispatch order, which is the
// only granularity either mission surface wants — both draw a whole mission at
// once.

export interface MissionItemGeometryInput {
	readonly organizationId: string;
	readonly missionId: string;
}

export interface SafeMissionItemGeometryRow {
	readonly id: string;
	readonly missionId: string;
	readonly position: number;
	readonly lat: number;
	readonly lng: number;
	readonly geojson: GeoJsonGeometry;
	readonly geomType: string;
	readonly updatedAt: Date;
}

export async function listMissionItemGeometry(
	db: Kysely<SimmerDatabase>,
	input: MissionItemGeometryInput,
): Promise<SafeMissionItemGeometryRow[]> {
	const result = await sql<SafeMissionItemGeometryRow>`
		select
			mi.id,
			mi.mission_id as "missionId",
			mi.position,
			mi.lat,
			mi.lng,
			mi.geojson,
			mi.geom_type as "geomType",
			mi.updated_at as "updatedAt"
		from mission_items mi
		where mi.mission_id = ${input.missionId}
			and mi.organization_id = ${input.organizationId}
			and mi.deleted_at is null
		order by mi.position asc, mi.created_at asc, mi.id
	`.execute(db);

	return result.rows;
}
