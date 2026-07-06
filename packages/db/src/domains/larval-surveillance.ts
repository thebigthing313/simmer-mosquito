import { type Kysely, type RawBuilder, sql } from 'kysely';

import type { GeoJsonGeometry, SimmerDatabase } from '../index.js';

/** One sample still awaiting species identification, with its inspection context. */
export interface AwaitingSampleRow {
	readonly id: string;
	readonly displayName: string | null;
	readonly inspectionDate: string;
	readonly habitatId: string | null;
	readonly habitatName: string | null;
}

export interface SamplesAwaitingInput {
	readonly organizationId: string;
	/** Inclusive lower bound on the parent inspection's date (`YYYY-MM-DD`). */
	readonly since: string;
	/** Maximum rows to return; the total is reported separately. */
	readonly limit: number;
}

export interface SamplesAwaitingResult {
	readonly total: number;
	readonly samples: AwaitingSampleRow[];
}

/**
 * Recent samples awaiting identification for one organization: collected samples
 * that carry no identified species yet and have not been closed out as
 * zero-larvae or unidentifiable. Bounded by the parent inspection's date so the
 * overview reads only the current window, and returned oldest-first because the
 * longest-waiting samples are the ones that need attention.
 *
 * Reported `total` is the full count in the window; `samples` is capped at
 * `limit` for the preview list.
 */
export async function listSamplesAwaitingIdentification(
	db: Kysely<SimmerDatabase>,
	input: SamplesAwaitingInput,
): Promise<SamplesAwaitingResult> {
	// A sample is "awaiting" when it holds larvae (not zero, not unidentifiable)
	// and no species row has been recorded against it yet.
	const awaitingCondition = sql`
		s.organization_id = ${input.organizationId}
		and s.deleted_at is null
		and s.is_zero_larvae = false
		and s.unidentifiable_reason is null
		and i.deleted_at is null
		and i.inspection_date >= ${input.since}
		and not exists (
			select 1
			from sample_species ss
			where ss.sample_id = s.id
				and ss.deleted_at is null
		)
	`;

	const totalResult = await sql<{ total: number }>`
		select count(*)::int as total
		from samples s
		join inspections i on i.id = s.inspection_id
		where ${awaitingCondition}
	`.execute(db);

	const listResult = await sql<AwaitingSampleRow>`
		select
			s.id,
			s.display_name as "displayName",
			i.inspection_date::text as "inspectionDate",
			i.habitat_id as "habitatId",
			h.habitat_name as "habitatName"
		from samples s
		join inspections i on i.id = s.inspection_id
		left join habitats h on h.id = i.habitat_id
		where ${awaitingCondition}
		order by i.inspection_date asc, s.created_at asc
		limit ${input.limit}
	`.execute(db);

	return {
		total: totalResult.rows[0]?.total ?? 0,
		samples: listResult.rows,
	};
}

// --- inspection map surface -------------------------------------------------
//
// Mirrors the habitat map trio (tile / bbox list / by-id) so the inspections
// explorer streams vector tiles for the whole viewport and reads a bounded
// display list for the visible subset. Inspections are dated surveillance
// events that carry their own owned geometry (usually inherited from the parent
// habitat), so they are spatially queryable exactly like habitats.

/** A larval-density enum value as stored on `inspections.density`. */
export type InspectionDensity = 'none' | 'light' | 'medium' | 'heavy' | 'very_heavy';

export const inspectionDensityValues: readonly InspectionDensity[] = [
	'none',
	'light',
	'medium',
	'heavy',
	'very_heavy',
];

export interface InspectionMvtTileFilters {
	readonly isWet?: boolean;
	/** Match inspections recorded at any of these larval densities. */
	readonly densities?: readonly InspectionDensity[];
	/** Only inspections where at least one life stage (eggs → pupae) was found. */
	readonly positiveOnly?: boolean;
	readonly habitatTypeIds?: readonly string[];
	/** Inclusive lower bound on `inspection_date` (`YYYY-MM-DD`). */
	readonly dateFrom?: string;
	/** Inclusive upper bound on `inspection_date` (`YYYY-MM-DD`). */
	readonly dateTo?: string;
}

export interface InspectionMvtTileInput {
	readonly z: number;
	readonly x: number;
	readonly y: number;
	readonly organizationId: string;
	readonly filters?: InspectionMvtTileFilters;
}

export interface InspectionBounds {
	readonly west: number;
	readonly south: number;
	readonly east: number;
	readonly north: number;
}

export interface InspectionBoundingBoxInput {
	readonly organizationId: string;
	readonly bounds: InspectionBounds;
	readonly filters?: InspectionMvtTileFilters;
	readonly limit: number;
}

export interface InspectionByIdInput {
	readonly organizationId: string;
	readonly id: string;
}

/**
 * A server-safe inspection display row: the geometry projection plus the record
 * fields the explorer list and detail card need, with the parent habitat name,
 * address label, and inspector name joined so a row can identify itself without
 * a second lookup (an inspection has no name of its own).
 */
export interface SafeInspectionDisplayRow {
	readonly id: string;
	readonly organizationId: string;
	readonly lat: number;
	readonly lng: number;
	readonly geojson: GeoJsonGeometry;
	readonly geomType: string;
	readonly habitatId: string | null;
	readonly habitatName: string | null;
	readonly habitatTypeId: string | null;
	readonly addressId: string | null;
	readonly addressDisplayName: string | null;
	readonly inspectedByProfileId: string | null;
	readonly inspectedByName: string | null;
	readonly inspectionDate: string;
	readonly isWet: boolean;
	readonly dipCount: number | null;
	readonly density: InspectionDensity | null;
	readonly larvaeCount: number | null;
	readonly hasEggs: boolean;
	readonly hasFirstInstar: boolean;
	readonly hasSecondInstar: boolean;
	readonly hasThirdInstar: boolean;
	readonly hasFourthInstar: boolean;
	readonly hasPupae: boolean;
	readonly createdAt: Date;
	readonly updatedAt: Date;
}

export async function getInspectionMvtTile(
	db: Kysely<SimmerDatabase>,
	input: InspectionMvtTileInput,
): Promise<Uint8Array> {
	const whereClauses = inspectionSpatialWhereClauses(input);

	const result = await sql<{ readonly tile: Uint8Array | null }>`
		with
		bounds as (
			select
				st_tileenvelope(${input.z}, ${input.x}, ${input.y}) as geom_3857,
				st_transform(st_tileenvelope(${input.z}, ${input.x}, ${input.y}), 4326) as geom_4326
		),
		tile_rows as (
			select
				i.id,
				i.is_wet as "isWet",
				i.density::text as "density",
				i.habitat_type_id as "habitatTypeId",
				(
					i.has_eggs or i.has_first_instar or i.has_second_instar
					or i.has_third_instar or i.has_fourth_instar or i.has_pupae
				) as "positive",
				st_asmvtgeom(
					st_transform(i.geom, 3857),
					bounds.geom_3857,
					extent => 4096,
					buffer => 64
				) as geom
			from inspections i
			cross join bounds
			where ${sql.join(whereClauses, sql` and `)}
		)
		select coalesce(st_asmvt(tile_rows, 'inspections', 4096, 'geom'), ''::bytea) as tile
		from tile_rows
	`.execute(db);

	return result.rows[0]?.tile ?? new Uint8Array();
}

export async function listInspectionDisplayRowsByBounds(
	db: Kysely<SimmerDatabase>,
	input: InspectionBoundingBoxInput,
): Promise<SafeInspectionDisplayRow[]> {
	const whereClauses = inspectionSpatialWhereClauses(input);

	const result = await sql<SafeInspectionDisplayRow>`
		with bounds as (
			select st_makeenvelope(
				${input.bounds.west},
				${input.bounds.south},
				${input.bounds.east},
				${input.bounds.north},
				4326
			) as geom_4326
		)
		select ${inspectionDisplayColumns}
		from inspections i
		left join habitats h on h.id = i.habitat_id
		left join addresses a on a.id = i.address_id
		left join profiles p on p.id = i.inspected_by_profile_id
		cross join bounds
		where ${sql.join(whereClauses, sql` and `)}
		order by i.inspection_date desc, i.created_at desc, i.id
		limit ${input.limit}
	`.execute(db);

	return result.rows;
}

export async function getInspectionDisplayRowById(
	db: Kysely<SimmerDatabase>,
	input: InspectionByIdInput,
): Promise<SafeInspectionDisplayRow | undefined> {
	const result = await sql<SafeInspectionDisplayRow>`
		select ${inspectionDisplayColumns}
		from inspections i
		left join habitats h on h.id = i.habitat_id
		left join addresses a on a.id = i.address_id
		left join profiles p on p.id = i.inspected_by_profile_id
		where i.id = ${input.id}
			and i.organization_id = ${input.organizationId}
			and i.deleted_at is null
		limit 1
	`.execute(db);

	return result.rows[0];
}

// Shared projection for the bbox list + by-id readers. Kept as one fragment so
// the two paths can never drift in shape.
const inspectionDisplayColumns = sql`
	i.id,
	i.organization_id as "organizationId",
	i.lat,
	i.lng,
	i.geojson,
	i.geom_type as "geomType",
	i.habitat_id as "habitatId",
	h.habitat_name as "habitatName",
	i.habitat_type_id as "habitatTypeId",
	i.address_id as "addressId",
	a.display_name as "addressDisplayName",
	i.inspected_by_profile_id as "inspectedByProfileId",
	p.display_name as "inspectedByName",
	i.inspection_date::text as "inspectionDate",
	i.is_wet as "isWet",
	i.dip_count as "dipCount",
	i.density::text as "density",
	i.larvae_count as "larvaeCount",
	i.has_eggs as "hasEggs",
	i.has_first_instar as "hasFirstInstar",
	i.has_second_instar as "hasSecondInstar",
	i.has_third_instar as "hasThirdInstar",
	i.has_fourth_instar as "hasFourthInstar",
	i.has_pupae as "hasPupae",
	i.created_at as "createdAt",
	i.updated_at as "updatedAt"
`;

function inspectionSpatialWhereClauses(input: {
	readonly organizationId: string;
	readonly filters?: InspectionMvtTileFilters;
}): RawBuilder<boolean>[] {
	const whereClauses: RawBuilder<boolean>[] = [
		sql<boolean>`i.organization_id = ${input.organizationId}`,
		sql<boolean>`i.deleted_at is null`,
		sql<boolean>`i.geom && bounds.geom_4326`,
		sql<boolean>`st_intersects(i.geom, bounds.geom_4326)`,
	];

	if (input.filters?.isWet !== undefined) {
		whereClauses.push(sql<boolean>`i.is_wet = ${input.filters.isWet}`);
	}

	if (input.filters?.densities !== undefined && input.filters.densities.length > 0) {
		whereClauses.push(
			sql<boolean>`i.density = any(${[...input.filters.densities]}::larval_density[])`,
		);
	}

	if (input.filters?.positiveOnly === true) {
		whereClauses.push(
			sql<boolean>`(
				i.has_eggs or i.has_first_instar or i.has_second_instar
				or i.has_third_instar or i.has_fourth_instar or i.has_pupae
			)`,
		);
	}

	if (input.filters?.habitatTypeIds !== undefined && input.filters.habitatTypeIds.length > 0) {
		whereClauses.push(
			sql<boolean>`i.habitat_type_id = any(${[...input.filters.habitatTypeIds]}::uuid[])`,
		);
	}

	if (input.filters?.dateFrom !== undefined) {
		whereClauses.push(sql<boolean>`i.inspection_date >= ${input.filters.dateFrom}`);
	}

	if (input.filters?.dateTo !== undefined) {
		whereClauses.push(sql<boolean>`i.inspection_date <= ${input.filters.dateTo}`);
	}

	return whereClauses;
}
