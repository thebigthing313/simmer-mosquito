import { type Kysely, type RawBuilder, sql } from 'kysely';

import type { GeoJsonGeometry, SimmerDatabase } from '../index.js';
import type { MapTilesetLayer } from './map-layers.js';
import { regionMembershipClauses } from './map-region-filter.js';
import {
	type MapDisplayColumns,
	type MapRecordSurfaceReaders,
	mapRecordSurface,
} from './map-surface.js';

export interface HabitatMvtTileFilters {
	readonly isActive?: boolean;
	readonly isInaccessible?: boolean;
	readonly habitatTypeIds?: readonly string[];
	/** Match habitats carrying any of these tag ids (polymorphic `tag_items`). */
	readonly tagIds?: readonly string[];
	/** Match habitats falling inside any of these regions. */
	readonly regionIds?: readonly string[];
	/** Case-insensitive substring match across habitat name + description. */
	readonly search?: string;
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

const habitatDisplayColumns: MapDisplayColumns<SafeHabitatDisplayRow> = {
	id: sql`h.id`,
	organizationId: sql`h.organization_id`,
	lat: sql`h.lat`,
	lng: sql`h.lng`,
	geojson: sql`h.geojson`,
	geomType: sql`h.geom_type`,
	addressId: sql`h.address_id`,
	habitatTypeId: sql`h.habitat_type_id`,
	habitatName: sql`h.habitat_name`,
	description: sql`h.description`,
	isActive: sql`h.is_active`,
	isInaccessible: sql`h.is_inaccessible`,
	metadata: sql`h.metadata`,
	createdByProfileId: sql`h.created_by_profile_id`,
	updatedByProfileId: sql`h.updated_by_profile_id`,
	createdAt: sql`h.created_at`,
	updatedAt: sql`h.updated_at`,
};

/**
 * The habitats map surface: the tile the explorer draws, the extent it frames,
 * the viewport-bounded page its rail reads, and the row its detail card opens.
 *
 * The layer is the argument rather than a literal here, because it is the key
 * this surface is registered under in `map-surface-register.ts`.
 */
export function habitatSurface(
	layer: MapTilesetLayer,
): MapRecordSurfaceReaders<HabitatMvtTileFilters, SafeHabitatDisplayRow> {
	return mapRecordSurface<HabitatMvtTileFilters, SafeHabitatDisplayRow>({
		layer,
		from: sql`habitats h`,
		alias: 'h',
		geom: sql`h.geom`,
		properties: [
			sql`h.id`,
			sql`h.habitat_name as "habitatName"`,
			sql`h.habitat_type_id as "habitatTypeId"`,
			sql`h.is_active as "isActive"`,
			sql`h.is_inaccessible as "isInaccessible"`,
			sql`h.geom_type as "geomType"`,
		],
		filterWhere: habitatFilterWhere,
		display: {
			columns: habitatDisplayColumns,
			orderBy: sql`coalesce(h.habitat_name, h.id::text), h.id`,
		},
	});
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

export interface HabitatsByIdsInput {
	readonly organizationId: string;
	readonly ids: readonly string[];
}

/**
 * A habitat display row enriched with its address's display name. Powers
 * route/site views that cluster consecutive stops sharing one address without a
 * second address lookup on the client.
 */
export interface HabitatSiteDisplayRow extends SafeHabitatDisplayRow {
	readonly addressDisplayName: string | null;
}

/**
 * Resolve a specific set of habitats (by id) for one organization, with each
 * habitat's address label joined in. Unlike the bbox reader this is not spatially
 * bounded — callers pass an explicit id set (e.g. the members of a route) and get
 * geometry, status, and address back in a single round-trip. Result order is
 * unspecified; callers order by their own sequence (route item position).
 */
export async function listHabitatDisplayRowsByIds(
	db: Kysely<SimmerDatabase>,
	input: HabitatsByIdsInput,
): Promise<HabitatSiteDisplayRow[]> {
	if (input.ids.length === 0) {
		return [];
	}

	const result = await sql<HabitatSiteDisplayRow>`
		select
			h.id,
			h.organization_id as "organizationId",
			h.lat,
			h.lng,
			h.geojson,
			h.geom_type as "geomType",
			h.address_id as "addressId",
			a.display_name as "addressDisplayName",
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
		left join addresses a on a.id = h.address_id
		where h.organization_id = ${input.organizationId}
			and h.deleted_at is null
			and h.id = any(${[...input.ids]}::uuid[])
	`.execute(db);

	return result.rows;
}

export interface HabitatSearchInput {
	readonly organizationId: string;
	readonly search: string;
	readonly limit: number;
}

/**
 * Name/address substring search across an organization's habitats, ordered by
 * name. Non-spatial (unlike the tile/bbox readers) — it powers "add a stop"
 * pickers where the user types a name rather than pans a map. Matches are literal
 * (position()-based, no LIKE wildcard escaping) across habitat name and the
 * joined address label.
 */
export async function searchHabitatSites(
	db: Kysely<SimmerDatabase>,
	input: HabitatSearchInput,
): Promise<HabitatSiteDisplayRow[]> {
	const search = input.search.trim();
	if (search.length === 0) {
		return [];
	}

	const result = await sql<HabitatSiteDisplayRow>`
		select
			h.id,
			h.organization_id as "organizationId",
			h.lat,
			h.lng,
			h.geojson,
			h.geom_type as "geomType",
			h.address_id as "addressId",
			a.display_name as "addressDisplayName",
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
		left join addresses a on a.id = h.address_id
		where h.organization_id = ${input.organizationId}
			and h.deleted_at is null
			and (
				position(lower(${search}) in lower(coalesce(h.habitat_name, ''))) > 0
				or position(lower(${search}) in lower(coalesce(a.display_name, ''))) > 0
			)
		order by coalesce(h.habitat_name, h.id::text), h.id
		limit ${input.limit}
	`.execute(db);

	return result.rows;
}

function habitatFilterWhere(filters: HabitatMvtTileFilters | undefined): RawBuilder<boolean>[] {
	const whereClauses: RawBuilder<boolean>[] = [];

	if (filters?.isActive !== undefined) {
		whereClauses.push(sql<boolean>`h.is_active = ${filters.isActive}`);
	}

	if (filters?.isInaccessible !== undefined) {
		whereClauses.push(sql<boolean>`h.is_inaccessible = ${filters.isInaccessible}`);
	}

	if (filters?.habitatTypeIds !== undefined) {
		whereClauses.push(
			sql<boolean>`h.habitat_type_id = any(${[...filters.habitatTypeIds]}::uuid[])`,
		);
	}

	if (filters?.tagIds !== undefined) {
		whereClauses.push(
			sql<boolean>`exists (
				select 1
				from tag_items ti
				where ti.entity_type = 'habitat'
					and ti.entity_id = h.id
					and ti.deleted_at is null
					and ti.tag_id = any(${[...filters.tagIds]}::uuid[])
			)`,
		);
	}

	whereClauses.push(
		...regionMembershipClauses({
			geom: sql`h.geom`,
			geomType: sql`h.geom_type`,
			organizationId: sql`h.organization_id`,
			regionIds: filters?.regionIds,
		}),
	);

	const search = filters?.search?.trim();
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
