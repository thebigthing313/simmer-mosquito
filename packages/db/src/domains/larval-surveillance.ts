import { type Kysely, type RawBuilder, sql } from 'kysely';

import type { GeoJsonGeometry, SimmerDatabase } from '../index.js';
import { type MapExtent, readMapExtent } from './map-extent.js';

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
	readonly offset: number;
}

/** A page of inspection display rows plus the full count for the viewport + filters. */
export interface InspectionDisplayPageResult {
	readonly total: number;
	readonly rows: SafeInspectionDisplayRow[];
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
): Promise<InspectionDisplayPageResult> {
	const whereClauses = inspectionSpatialWhereClauses(input);

	const result = await sql<SafeInspectionDisplayRow & { readonly total: number }>`
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
			${inspectionDisplayColumns},
			count(*) over()::int as "total"
		from inspections i
		left join habitats h on h.id = i.habitat_id
		left join addresses a on a.id = i.address_id
		left join profiles p on p.id = i.inspected_by_profile_id
		cross join bounds
		where ${sql.join(whereClauses, sql` and `)}
		order by i.inspection_date desc, i.created_at desc, i.id
		limit ${input.limit}
		offset ${input.offset}
	`.execute(db);

	return {
		total: result.rows[0]?.total ?? 0,
		rows: result.rows,
	};
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

/**
 * Extent of every inspection matching the tile filters, ignoring the viewport —
 * what the explorer map frames on load and after a filter change.
 */
export async function getInspectionMapExtent(
	db: Kysely<SimmerDatabase>,
	input: { readonly organizationId: string; readonly filters?: InspectionMvtTileFilters },
): Promise<MapExtent | null> {
	return readMapExtent(db, {
		geom: sql`i.geom`,
		from: sql`inspections i`,
		where: inspectionFilterWhereClauses(input),
	});
}

/** Filter predicates narrowed to a `bounds` CTE — the tile + bbox reads. */
function inspectionSpatialWhereClauses(input: {
	readonly organizationId: string;
	readonly filters?: InspectionMvtTileFilters;
}): RawBuilder<boolean>[] {
	return [
		...inspectionFilterWhereClauses(input),
		sql<boolean>`i.geom && bounds.geom_4326`,
		sql<boolean>`st_intersects(i.geom, bounds.geom_4326)`,
	];
}

/** Tenancy + filter predicates, shared by the tile, bbox, and extent reads. */
function inspectionFilterWhereClauses(input: {
	readonly organizationId: string;
	readonly filters?: InspectionMvtTileFilters;
}): RawBuilder<boolean>[] {
	const whereClauses: RawBuilder<boolean>[] = [
		sql<boolean>`i.organization_id = ${input.organizationId}`,
		sql<boolean>`i.deleted_at is null`,
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

// --- sample map surface -----------------------------------------------------
//
// The samples explorer is map-paired like the inspection/habitat explorers, but a
// sample has no geometry of its own: it inherits its parent inspection's owned
// point/line/polygon. So the trio below (tile / bbox list / by-id) joins samples
// to inspections and projects the inspection's geometry, while every sample's
// identified species is rolled up server-side into a json array — the on-demand
// samples / sample_species shapes can't gather a cross-habitat window in one
// bounded client request, the same constraint that keeps the "awaiting" rollup
// above here rather than in a client include.

/**
 * A sample's lifecycle state as the explorer filters, colors, and labels it. The
 * states are not strictly exclusive in the data (a zero-larvae sample can also
 * carry an unidentifiable reason), so the server resolves a single status by the
 * precedence in {@link sampleStatusExpression}: an identified result wins over any
 * closed-out reason.
 */
export type SampleStatus = 'identified' | 'awaiting' | 'zero_larvae' | 'unidentifiable';

export const sampleStatusValues: readonly SampleStatus[] = [
	'identified',
	'awaiting',
	'zero_larvae',
	'unidentifiable',
];

/** One identified species within a sample, as rolled up for the explorer row. */
export interface SampleSpeciesResult {
	readonly speciesId: string;
	readonly larvaeCount: number;
}

/** Server-side filters shared by the sample tile, bbox list, and by-id readers. */
export interface SampleListFilters {
	/** Match samples that have an identified row for any of these species. */
	readonly speciesIds?: readonly string[];
	/** Restrict to samples in this lifecycle state. */
	readonly status?: SampleStatus;
	/** Only samples flagged as containing non-mosquito organisms or material. */
	readonly nonMosquitoOnly?: boolean;
	/** Inclusive lower bound on the parent inspection's date (`YYYY-MM-DD`). */
	readonly dateFrom?: string;
	/** Inclusive upper bound on the parent inspection's date (`YYYY-MM-DD`). */
	readonly dateTo?: string;
}

/**
 * A server-safe sample display row: the parent inspection's geometry projection
 * plus the sample's own result flags, its inspection date and habitat (so the row
 * can name and link itself), its resolved lifecycle status, and its identified
 * species rolled up with counts. Species names resolve client-side from the eager
 * taxonomy catalog, so only ids and counts ride here.
 */
export interface SafeSampleDisplayRow {
	readonly id: string;
	readonly organizationId: string;
	readonly lat: number;
	readonly lng: number;
	readonly geojson: GeoJsonGeometry;
	readonly geomType: string;
	readonly displayName: string | null;
	readonly inspectionId: string;
	readonly inspectionDate: string;
	readonly habitatId: string | null;
	readonly habitatName: string | null;
	readonly isZeroLarvae: boolean;
	readonly hasNonMosquito: boolean;
	readonly unidentifiableReason: string | null;
	readonly createdByProfileId: string | null;
	readonly status: SampleStatus;
	/** Most recent identification date across the sample's species rows, if any. */
	readonly identifiedAt: string | null;
	/** Total larvae counted across every identified species. */
	readonly larvaeTotal: number;
	/** Identified species with counts, highest count first. */
	readonly results: SampleSpeciesResult[];
	readonly createdAt: Date;
	readonly updatedAt: Date;
}

export interface SampleBounds {
	readonly west: number;
	readonly south: number;
	readonly east: number;
	readonly north: number;
}

export interface SampleMvtTileInput {
	readonly z: number;
	readonly x: number;
	readonly y: number;
	readonly organizationId: string;
	readonly filters?: SampleListFilters;
}

export interface SampleBoundingBoxInput {
	readonly organizationId: string;
	readonly bounds: SampleBounds;
	readonly filters?: SampleListFilters;
	readonly limit: number;
	readonly offset: number;
}

/** A page of sample display rows plus the full count for the viewport + filters. */
export interface SampleDisplayPageResult {
	readonly total: number;
	readonly rows: SafeSampleDisplayRow[];
}

export interface SampleByIdInput {
	readonly organizationId: string;
	readonly id: string;
}

// Resolves a single lifecycle status by precedence. Shared by the tile (feature
// paint) and the display readers so the map color and the list badge can never
// disagree about what a sample is.
const sampleStatusExpression = sql`
	case
		when exists (
			select 1 from sample_species ss where ss.sample_id = s.id and ss.deleted_at is null
		) then 'identified'
		when s.is_zero_larvae then 'zero_larvae'
		when s.unidentifiable_reason is not null then 'unidentifiable'
		else 'awaiting'
	end
`;

export async function getSampleMvtTile(
	db: Kysely<SimmerDatabase>,
	input: SampleMvtTileInput,
): Promise<Uint8Array> {
	const whereClauses = sampleSpatialWhereClauses(input);

	const result = await sql<{ readonly tile: Uint8Array | null }>`
		with
		bounds as (
			select
				st_tileenvelope(${input.z}, ${input.x}, ${input.y}) as geom_3857,
				st_transform(st_tileenvelope(${input.z}, ${input.x}, ${input.y}), 4326) as geom_4326
		),
		tile_rows as (
			select
				s.id,
				(${sampleStatusExpression}) as "status",
				st_asmvtgeom(
					st_transform(i.geom, 3857),
					bounds.geom_3857,
					extent => 4096,
					buffer => 64
				) as geom
			from samples s
			join inspections i on i.id = s.inspection_id
			cross join bounds
			where ${sql.join(whereClauses, sql` and `)}
		)
		select coalesce(st_asmvt(tile_rows, 'samples', 4096, 'geom'), ''::bytea) as tile
		from tile_rows
	`.execute(db);

	return result.rows[0]?.tile ?? new Uint8Array();
}

export async function listSampleDisplayRowsByBounds(
	db: Kysely<SimmerDatabase>,
	input: SampleBoundingBoxInput,
): Promise<SampleDisplayPageResult> {
	const whereClauses = sampleSpatialWhereClauses(input);

	const result = await sql<SafeSampleDisplayRow & { readonly total: number }>`
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
			${sampleDisplayColumns},
			count(*) over()::int as "total"
		from samples s
		join inspections i on i.id = s.inspection_id
		left join habitats h on h.id = i.habitat_id
		${sampleResultsLateral}
		cross join bounds
		where ${sql.join(whereClauses, sql` and `)}
		order by i.inspection_date desc, s.created_at desc, s.id
		limit ${input.limit}
		offset ${input.offset}
	`.execute(db);

	return {
		total: result.rows[0]?.total ?? 0,
		rows: result.rows,
	};
}

export async function getSampleDisplayRowById(
	db: Kysely<SimmerDatabase>,
	input: SampleByIdInput,
): Promise<SafeSampleDisplayRow | undefined> {
	const result = await sql<SafeSampleDisplayRow>`
		select ${sampleDisplayColumns}
		from samples s
		join inspections i on i.id = s.inspection_id
		left join habitats h on h.id = i.habitat_id
		${sampleResultsLateral}
		where s.id = ${input.id}
			and s.organization_id = ${input.organizationId}
			and s.deleted_at is null
			and i.deleted_at is null
			and i.geom is not null
		limit 1
	`.execute(db);

	return result.rows[0];
}

// The per-sample species roll-up, kept as one fragment so the bbox and by-id
// readers can never drift in shape.
const sampleResultsLateral = sql`
	left join lateral (
		select
			max(ss.identified_at)::text as identified_at,
			sum(ss.larvae_count)::int as larvae_total,
			json_agg(
				json_build_object('speciesId', ss.species_id, 'larvaeCount', ss.larvae_count)
				order by ss.larvae_count desc, ss.species_id
			) as results
		from sample_species ss
		where ss.sample_id = s.id and ss.deleted_at is null
	) agg on true
`;

// Shared projection for the bbox list + by-id readers. Geometry comes from the
// parent inspection; the roll-up columns come from the `agg` lateral above.
const sampleDisplayColumns = sql`
	s.id,
	s.organization_id as "organizationId",
	i.lat,
	i.lng,
	i.geojson,
	i.geom_type as "geomType",
	s.display_name as "displayName",
	s.inspection_id as "inspectionId",
	i.inspection_date::text as "inspectionDate",
	i.habitat_id as "habitatId",
	h.habitat_name as "habitatName",
	s.is_zero_larvae as "isZeroLarvae",
	s.has_non_mosquito as "hasNonMosquito",
	s.unidentifiable_reason as "unidentifiableReason",
	s.created_by_profile_id as "createdByProfileId",
	(${sampleStatusExpression}) as "status",
	agg.identified_at as "identifiedAt",
	coalesce(agg.larvae_total, 0)::int as "larvaeTotal",
	coalesce(agg.results, '[]'::json) as "results",
	s.created_at as "createdAt",
	s.updated_at as "updatedAt"
`;

/**
 * Extent of every sample matching the tile filters, ignoring the viewport. A
 * sample inherits its parent inspection's geometry, so the join mirrors the tile
 * read exactly.
 */
export async function getSampleMapExtent(
	db: Kysely<SimmerDatabase>,
	input: { readonly organizationId: string; readonly filters?: SampleListFilters },
): Promise<MapExtent | null> {
	return readMapExtent(db, {
		geom: sql`i.geom`,
		from: sql`samples s join inspections i on i.id = s.inspection_id`,
		where: sampleFilterWhereClauses(input),
	});
}

/** Filter predicates narrowed to a `bounds` CTE — the tile + bbox reads. */
function sampleSpatialWhereClauses(input: {
	readonly organizationId: string;
	readonly filters?: SampleListFilters;
}): RawBuilder<boolean>[] {
	return [
		...sampleFilterWhereClauses(input),
		sql<boolean>`i.geom && bounds.geom_4326`,
		sql<boolean>`st_intersects(i.geom, bounds.geom_4326)`,
	];
}

/** Tenancy + filter predicates, shared by the tile, bbox, and extent reads. */
function sampleFilterWhereClauses(input: {
	readonly organizationId: string;
	readonly filters?: SampleListFilters;
}): RawBuilder<boolean>[] {
	const clauses: RawBuilder<boolean>[] = [
		sql<boolean>`s.organization_id = ${input.organizationId}`,
		sql<boolean>`s.deleted_at is null`,
		sql<boolean>`i.deleted_at is null`,
		sql<boolean>`i.geom is not null`,
	];

	const filters = input.filters;
	if (filters === undefined) {
		return clauses;
	}

	if (filters.dateFrom !== undefined) {
		clauses.push(sql<boolean>`i.inspection_date >= ${filters.dateFrom}`);
	}
	if (filters.dateTo !== undefined) {
		clauses.push(sql<boolean>`i.inspection_date <= ${filters.dateTo}`);
	}
	if (filters.nonMosquitoOnly === true) {
		clauses.push(sql<boolean>`s.has_non_mosquito = true`);
	}
	if (filters.speciesIds !== undefined && filters.speciesIds.length > 0) {
		clauses.push(
			sql<boolean>`exists (
				select 1 from sample_species ss
				where ss.sample_id = s.id
					and ss.deleted_at is null
					and ss.species_id = any(${[...filters.speciesIds]}::uuid[])
			)`,
		);
	}
	if (filters.status !== undefined) {
		clauses.push(sampleStatusClause(filters.status));
	}

	return clauses;
}

/** The independent predicate that defines each lifecycle status filter. */
function sampleStatusClause(status: SampleStatus): RawBuilder<boolean> {
	switch (status) {
		case 'identified':
			return sql<boolean>`exists (
				select 1 from sample_species ss
				where ss.sample_id = s.id and ss.deleted_at is null
			)`;
		case 'zero_larvae':
			return sql<boolean>`s.is_zero_larvae = true`;
		case 'unidentifiable':
			return sql<boolean>`s.unidentifiable_reason is not null`;
		case 'awaiting':
			return sql<boolean>`(
				s.is_zero_larvae = false
				and s.unidentifiable_reason is null
				and not exists (
					select 1 from sample_species ss
					where ss.sample_id = s.id and ss.deleted_at is null
				)
			)`;
	}
}
