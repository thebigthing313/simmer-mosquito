import { type Kysely, type RawBuilder, sql } from 'kysely';

import type { GeoJsonGeometry, SimmerDatabase } from '../index.js';
import type { MapTilesetLayer } from './map-layers.js';
import { regionMembershipClauses } from './map-region-filter.js';
import { searchClauses } from './map-search-filter.js';
import {
	type MapDisplayColumns,
	type MapReadContext,
	type MapRecordSurfaceReaders,
	mapRecordSurface,
} from './map-surface.js';
import { tagMembershipClauses } from './map-tag-filter.js';
import { assertIanaTimeZone, localDateSql } from './record-display-sql.js';

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
	/** Only untreated habitats; see {@link untreatedHabitatSql}. */
	readonly untreatedOnly?: boolean;
}

/** The rolling window an untreated reading sits in: today and the six days before. */
export const UNTREATED_WINDOW_DAYS = 7;

/**
 * The two larval density bands that make a reading heavy, the same two the
 * larval overview's heavy panel reads.
 */
const HEAVY_DENSITIES = ['heavy', 'very_heavy'] as const;

/**
 * Whether `habitats h` is untreated, as a predicate over `h`.
 *
 * An active Habitat is untreated while its most recent live inspection is
 * dated in the rolling {@link UNTREATED_WINDOW_DAYS} ending today in the
 * organization's zone, came back `heavy` or `very_heavy`, and nothing has
 * answered it since (`CONTEXT.md`, #991):
 *
 * - No live Chemical Application, Source Reduction or Biocontrol Action dated
 *   on or after that inspection names the Habitat by `habitat_id` or the
 *   inspection by `inspection_id`. All three tables carry both columns. Same
 *   day counts, because the columns are dates. No spatial matching: an
 *   unlinked action nearby is a data-entry finding, not a treatment.
 * - No open Requested Control Action names the Habitat. That Habitat is
 *   already counted on the requests queue or is on a Mission, and one
 *   condition gets one count.
 *
 * Inactive Habitats are out; inaccessible ones stay in, because a heavy reading
 * behind a locked gate is the one that needs a different plan. Ad Hoc
 * Inspections name no Habitat and never qualify one.
 *
 * Seven days and not the overview's fourteen: egg to adult averages about a
 * week, so a heavy reading older than that has emerged and is no longer a
 * treatment this can prompt.
 *
 * The read starts from the organization's live inspections dated after the
 * window opens and keeps the latest per Habitat, then asks the rest of the rule
 * of that small set, and `h.id` is tested against the answer. That is the
 * latest live inspection the rule names: a Habitat's latest reading is dated
 * after the window opens exactly when some reading of it is, so a Habitat the
 * scan never sees has nothing in the window. A reading dated after today is
 * still in the scan and still wins the latest, so it shadows a heavy one
 * before it the same way it always did.
 *
 * Every table is read inside the organization, which is what lets each lookup
 * seek on the `(organization_id, habitat_id)` and `(organization_id,
 * inspection_id)` indexes those tables already carry. A record names only
 * records of its own organization, so the scope narrows nothing the rule
 * counts.
 *
 * It was a subquery correlated on `h.id` until #1212, run once per live
 * Habitat. On the production clone that was 4.7 seconds for 15,321 habitats,
 * each run walking an index that could not seek on `habitat_id` alone; reading
 * the window first is the organization's inspections for one week off
 * `inspections_organization_date_idx`, about 1.5 ms. Today is `now()` in the
 * organization's zone, computed in SQL.
 */
export function untreatedHabitatSql(context: MapReadContext): RawBuilder<boolean> {
	const today = sql.raw(localDateSql('now()', assertIanaTimeZone(context.timeZone)));
	return sql<boolean>`(
		h.is_active = true
		and h.id in (
			select latest.habitat_id
			from (
				select distinct on (i.habitat_id) i.id, i.habitat_id, i.inspection_date, i.density
				from inspections i
				where i.organization_id = ${context.organizationId}
					and i.deleted_at is null
					and i.habitat_id is not null
					and i.inspection_date > ${today} - ${UNTREATED_WINDOW_DAYS}::int
				order by i.habitat_id, i.inspection_date desc, i.created_at desc
			) latest
			where latest.inspection_date <= ${today}
				and latest.density = any(${[...HEAVY_DENSITIES]}::larval_density[])
				and not exists (
					select 1 from applications a
					where a.organization_id = ${context.organizationId}
						and a.deleted_at is null
						and a.application_date >= latest.inspection_date
						and (a.habitat_id = latest.habitat_id or a.inspection_id = latest.id)
				)
				and not exists (
					select 1 from source_reductions sr
					where sr.organization_id = ${context.organizationId}
						and sr.deleted_at is null
						and sr.source_reduction_date >= latest.inspection_date
						and (sr.habitat_id = latest.habitat_id or sr.inspection_id = latest.id)
				)
				and not exists (
					select 1 from biocontrol_actions b
					where b.organization_id = ${context.organizationId}
						and b.deleted_at is null
						and b.biocontrol_date >= latest.inspection_date
						and (b.habitat_id = latest.habitat_id or b.inspection_id = latest.id)
				)
				and not exists (
					select 1 from requested_control_actions rca
					where rca.organization_id = ${context.organizationId}
						and rca.deleted_at is null
						and rca.resolved_at is null
						and rca.habitat_id = latest.habitat_id
				)
		)
	)`;
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
 * the viewport-bounded page its rail reads, the summary it draws in place of
 * the page over 100 in view, and the row its detail card opens.
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
		// What the Habitats rail counts by over 100 in view (#1244), each one a
		// filter the rail already has, so a group is a button that applies it.
		groupings: (context) => ({
			habitatTypeId: sql`h.habitat_type_id`,
			isActive: sql`h.is_active`,
			isInaccessible: sql`h.is_inaccessible`,
			untreated: untreatedHabitatSql(context),
		}),
		display: {
			columns: habitatDisplayColumns,
			// `natural_sort` puts `Habitat 9` ahead of `Habitat 10`.
			orderBy: sql`coalesce(h.habitat_name, h.id::text) collate natural_sort, h.id`,
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
		order by coalesce(h.habitat_name, h.id::text) collate natural_sort, h.id
		limit ${input.limit}
	`.execute(db);

	return result.rows;
}

function habitatFilterWhere(
	filters: HabitatMvtTileFilters | undefined,
	context: MapReadContext,
): RawBuilder<boolean>[] {
	const whereClauses: RawBuilder<boolean>[] = [];

	if (filters?.untreatedOnly === true) {
		whereClauses.push(untreatedHabitatSql(context));
	}

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

	whereClauses.push(
		...tagMembershipClauses({ id: sql`h.id`, entityType: 'habitat', tagIds: filters?.tagIds }),
	);

	whereClauses.push(
		...regionMembershipClauses({
			geom: sql`h.geom`,
			geomType: sql`h.geom_type`,
			organizationId: sql`h.organization_id`,
			regionIds: filters?.regionIds,
		}),
	);

	whereClauses.push(
		...searchClauses(filters?.search, [sql`coalesce(h.habitat_name, '')`, sql`h.description`]),
	);

	return whereClauses;
}
