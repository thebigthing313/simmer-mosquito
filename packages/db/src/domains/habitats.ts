import { type Kysely, type RawBuilder, sql } from 'kysely';

import type { GeoJsonGeometry, SimmerDatabase } from '../index.js';

export interface HabitatMvtTileFilters {
	readonly isActive?: boolean;
	readonly isInaccessible?: boolean;
	readonly habitatTypeIds?: readonly string[];
	/** Match habitats carrying any of these tag ids (polymorphic `tag_items`). */
	readonly tagIds?: readonly string[];
	/** Case-insensitive substring match across habitat name + description. */
	readonly search?: string;
}

export interface HabitatMvtTileInput {
	readonly z: number;
	readonly x: number;
	readonly y: number;
	readonly organizationId: string;
	readonly filters?: HabitatMvtTileFilters;
}

export interface HabitatBounds {
	readonly west: number;
	readonly south: number;
	readonly east: number;
	readonly north: number;
}

export interface HabitatBoundingBoxInput {
	readonly organizationId: string;
	readonly bounds: HabitatBounds;
	readonly filters?: HabitatMvtTileFilters;
	readonly limit: number;
}

export interface SafeHabitatDisplayRow {
	readonly id: string;
	readonly organizationId: string;
	readonly lat: number;
	readonly lng: number;
	readonly geojson: GeoJsonGeometry;
	readonly geomType: string;
	readonly addressId: string | null;
	readonly habitatTypeId: string | null;
	readonly habitatName: string | null;
	readonly description: string;
	readonly isActive: boolean;
	readonly isInaccessible: boolean;
	readonly metadata: unknown | null;
	readonly createdByProfileId: string | null;
	readonly updatedByProfileId: string | null;
	readonly createdAt: Date;
	readonly updatedAt: Date;
}

export async function getHabitatMvtTile(
	db: Kysely<SimmerDatabase>,
	input: HabitatMvtTileInput,
): Promise<Uint8Array> {
	const whereClauses = habitatSpatialWhereClauses(input);

	const result = await sql<{ readonly tile: Uint8Array | null }>`
		with
		bounds as (
			select
				st_tileenvelope(${input.z}, ${input.x}, ${input.y}) as geom_3857,
				st_transform(st_tileenvelope(${input.z}, ${input.x}, ${input.y}), 4326) as geom_4326
		),
		tile_rows as (
			select
				h.id,
				h.habitat_name as "habitatName",
				h.habitat_type_id as "habitatTypeId",
				h.is_active as "isActive",
				h.is_inaccessible as "isInaccessible",
				h.geom_type as "geomType",
				st_asmvtgeom(
					st_transform(h.geom, 3857),
					bounds.geom_3857,
					extent => 4096,
					buffer => 64
				) as geom
			from habitats h
			cross join bounds
			where ${sql.join(whereClauses, sql` and `)}
		)
		select coalesce(st_asmvt(tile_rows, 'habitats', 4096, 'geom'), ''::bytea) as tile
		from tile_rows
	`.execute(db);

	return result.rows[0]?.tile ?? new Uint8Array();
}

export async function listHabitatDisplayRowsByBounds(
	db: Kysely<SimmerDatabase>,
	input: HabitatBoundingBoxInput,
): Promise<SafeHabitatDisplayRow[]> {
	const whereClauses = habitatSpatialWhereClauses(input);

	const result = await sql<SafeHabitatDisplayRow>`
		with bounds as (
			select st_makeenvelope(
				${input.bounds.west},
				${input.bounds.south},
				${input.bounds.east},
				${input.bounds.north},
				4326
			) as geom_4326
		)
		select
			h.id,
			h.organization_id as "organizationId",
			h.lat,
			h.lng,
			h.geojson,
			h.geom_type as "geomType",
			h.address_id as "addressId",
			h.habitat_type_id as "habitatTypeId",
			h.habitat_name as "habitatName",
			h.description,
			h.is_active as "isActive",
			h.is_inaccessible as "isInaccessible",
			h.metadata,
			h.created_by_profile_id as "createdByProfileId",
			h.updated_by_profile_id as "updatedByProfileId",
			h.created_at as "createdAt",
			h.updated_at as "updatedAt"
		from habitats h
		cross join bounds
		where ${sql.join(whereClauses, sql` and `)}
		order by coalesce(h.habitat_name, h.id::text), h.id
		limit ${input.limit}
	`.execute(db);

	return result.rows;
}

export interface HabitatTypeUsageRow {
	readonly habitatTypeId: string;
	/** Count of the organization's active, non-deleted habitats carrying this type. */
	readonly activeCount: number;
}

/**
 * Active-habitat counts grouped by habitat type for one organization. Powers the
 * habitat-types management view, where each type shows how many live sites still
 * wear its label. Types with zero active habitats are simply absent from the
 * result; callers default missing ids to 0.
 */
export async function countActiveHabitatsByType(
	db: Kysely<SimmerDatabase>,
	input: { readonly organizationId: string },
): Promise<HabitatTypeUsageRow[]> {
	const result = await sql<{
		readonly habitatTypeId: string;
		readonly activeCount: string | number;
	}>`
		select
			h.habitat_type_id as "habitatTypeId",
			count(*) as "activeCount"
		from habitats h
		where h.organization_id = ${input.organizationId}
			and h.deleted_at is null
			and h.is_active = true
			and h.habitat_type_id is not null
		group by h.habitat_type_id
	`.execute(db);

	return result.rows.map((row) => ({
		habitatTypeId: row.habitatTypeId,
		activeCount: Number(row.activeCount),
	}));
}

export interface HabitatByIdInput {
	readonly organizationId: string;
	readonly id: string;
}

export async function getHabitatDisplayRowById(
	db: Kysely<SimmerDatabase>,
	input: HabitatByIdInput,
): Promise<SafeHabitatDisplayRow | undefined> {
	const result = await sql<SafeHabitatDisplayRow>`
		select
			h.id,
			h.organization_id as "organizationId",
			h.lat,
			h.lng,
			h.geojson,
			h.geom_type as "geomType",
			h.address_id as "addressId",
			h.habitat_type_id as "habitatTypeId",
			h.habitat_name as "habitatName",
			h.description,
			h.is_active as "isActive",
			h.is_inaccessible as "isInaccessible",
			h.metadata,
			h.created_by_profile_id as "createdByProfileId",
			h.updated_by_profile_id as "updatedByProfileId",
			h.created_at as "createdAt",
			h.updated_at as "updatedAt"
		from habitats h
		where h.id = ${input.id}
			and h.organization_id = ${input.organizationId}
			and h.deleted_at is null
		limit 1
	`.execute(db);

	return result.rows[0];
}

function habitatSpatialWhereClauses(input: {
	readonly organizationId: string;
	readonly filters?: HabitatMvtTileFilters;
}): RawBuilder<boolean>[] {
	const whereClauses: RawBuilder<boolean>[] = [
		sql<boolean>`h.organization_id = ${input.organizationId}`,
		sql<boolean>`h.deleted_at is null`,
		sql<boolean>`h.geom && bounds.geom_4326`,
		sql<boolean>`st_intersects(h.geom, bounds.geom_4326)`,
	];

	if (input.filters?.isActive !== undefined) {
		whereClauses.push(sql<boolean>`h.is_active = ${input.filters.isActive}`);
	}

	if (input.filters?.isInaccessible !== undefined) {
		whereClauses.push(sql<boolean>`h.is_inaccessible = ${input.filters.isInaccessible}`);
	}

	if (input.filters?.habitatTypeIds !== undefined) {
		whereClauses.push(
			sql<boolean>`h.habitat_type_id = any(${[...input.filters.habitatTypeIds]}::uuid[])`,
		);
	}

	if (input.filters?.tagIds !== undefined) {
		whereClauses.push(
			sql<boolean>`exists (
				select 1
				from tag_items ti
				where ti.entity_type = 'habitat'
					and ti.entity_id = h.id
					and ti.deleted_at is null
					and ti.tag_id = any(${[...input.filters.tagIds]}::uuid[])
			)`,
		);
	}

	const search = input.filters?.search?.trim();
	if (search !== undefined && search.length > 0) {
		// position()-based match keeps user input literal — no LIKE wildcard escaping.
		whereClauses.push(
			sql<boolean>`(
				position(lower(${search}) in lower(coalesce(h.habitat_name, ''))) > 0
				or position(lower(${search}) in lower(h.description)) > 0
			)`,
		);
	}

	return whereClauses;
}
