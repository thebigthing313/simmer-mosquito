import { type Kysely, type RawBuilder, sql } from 'kysely';

import type { GeoJsonGeometry, SimmerDatabase } from '../index.js';

// --- control-operations map surfaces ----------------------------------------
//
// Mirrors the larval map trio (tile / paged list / by-id) for the chemical,
// source-reduction, and biocontrol explorers. Each of these records carries its
// own owned point/line/polygon geometry, so it is spatially queryable exactly
// like a habitat. The vector tiles stream the whole viewport unbounded; the list
// reads a filtered, offset-paged window (no bbox) so the explorer's result rail
// is never an unbounded query. Lookup names (insecticide, method, unit) resolve
// client-side from the eager catalog, so only ids ride in the display rows.

const mvtExtent = 4096;
const mvtBuffer = 64;

/** Standard tile envelope CTE shared by every point tile query below. */
function tileEnvelopeCte(input: { readonly z: number; readonly x: number; readonly y: number }) {
	return sql`
		bounds as (
			select
				st_tileenvelope(${input.z}, ${input.x}, ${input.y}) as geom_3857,
				st_transform(st_tileenvelope(${input.z}, ${input.x}, ${input.y}), 4326) as geom_4326
		)
	`;
}

// --- chemical applications --------------------------------------------------

export interface ApplicationMapFilters {
	readonly insecticideIds?: readonly string[];
	readonly applicationMethodIds?: readonly string[];
	/** Inclusive lower bound on `application_date` (`YYYY-MM-DD`). */
	readonly dateFrom?: string;
	/** Inclusive upper bound on `application_date` (`YYYY-MM-DD`). */
	readonly dateTo?: string;
}

export interface ApplicationMvtTileInput {
	readonly z: number;
	readonly x: number;
	readonly y: number;
	readonly organizationId: string;
	readonly filters?: ApplicationMapFilters;
}

export interface ApplicationPageInput {
	readonly organizationId: string;
	readonly filters?: ApplicationMapFilters;
	readonly limit: number;
	readonly offset: number;
}

export interface ApplicationByIdInput {
	readonly organizationId: string;
	readonly id: string;
}

/**
 * A server-safe application display row: the geometry projection plus the record
 * fields the explorer list and detail card read. Product, method, and unit names
 * resolve client-side from the eager catalog, so only ids ride here.
 */
export interface SafeApplicationDisplayRow {
	readonly id: string;
	readonly organizationId: string;
	readonly lat: number;
	readonly lng: number;
	readonly geojson: GeoJsonGeometry;
	readonly geomType: string;
	readonly insecticideId: string;
	readonly applicationMethodId: string | null;
	readonly applicationDate: string;
	readonly amountApplied: number;
	readonly applicationUnitId: string;
	readonly habitatId: string | null;
	readonly createdAt: Date;
	readonly updatedAt: Date;
}

/** A page of application rows plus the full count for the current filters. */
export interface ApplicationPageResult {
	readonly total: number;
	readonly rows: SafeApplicationDisplayRow[];
}

function applicationFilterWhere(filters: ApplicationMapFilters | undefined): RawBuilder<boolean>[] {
	const clauses: RawBuilder<boolean>[] = [];
	if (filters?.insecticideIds !== undefined && filters.insecticideIds.length > 0) {
		clauses.push(sql<boolean>`a.insecticide_id = any(${[...filters.insecticideIds]}::uuid[])`);
	}
	if (filters?.applicationMethodIds !== undefined && filters.applicationMethodIds.length > 0) {
		clauses.push(
			sql<boolean>`a.application_method_id = any(${[...filters.applicationMethodIds]}::uuid[])`,
		);
	}
	if (filters?.dateFrom !== undefined) {
		clauses.push(sql<boolean>`a.application_date >= ${filters.dateFrom}`);
	}
	if (filters?.dateTo !== undefined) {
		clauses.push(sql<boolean>`a.application_date <= ${filters.dateTo}`);
	}
	return clauses;
}

export async function getApplicationMvtTile(
	db: Kysely<SimmerDatabase>,
	input: ApplicationMvtTileInput,
): Promise<Uint8Array> {
	const whereClauses: RawBuilder<boolean>[] = [
		sql<boolean>`a.organization_id = ${input.organizationId}`,
		sql<boolean>`a.deleted_at is null`,
		sql<boolean>`a.geom && bounds.geom_4326`,
		sql<boolean>`st_intersects(a.geom, bounds.geom_4326)`,
		...applicationFilterWhere(input.filters),
	];

	const result = await sql<{ readonly tile: Uint8Array | null }>`
		with
		${tileEnvelopeCte(input)},
		tile_rows as (
			select
				a.id,
				st_asmvtgeom(
					st_transform(a.geom, 3857),
					bounds.geom_3857,
					extent => ${mvtExtent},
					buffer => ${mvtBuffer}
				) as geom
			from applications a
			cross join bounds
			where ${sql.join(whereClauses, sql` and `)}
		)
		select coalesce(st_asmvt(tile_rows, 'chemical', ${mvtExtent}, 'geom'), ''::bytea) as tile
		from tile_rows
	`.execute(db);

	return result.rows[0]?.tile ?? new Uint8Array();
}

export async function listApplicationDisplayRowsPage(
	db: Kysely<SimmerDatabase>,
	input: ApplicationPageInput,
): Promise<ApplicationPageResult> {
	const whereClauses: RawBuilder<boolean>[] = [
		sql<boolean>`a.organization_id = ${input.organizationId}`,
		sql<boolean>`a.deleted_at is null`,
		...applicationFilterWhere(input.filters),
	];

	const result = await sql<SafeApplicationDisplayRow & { readonly total: number }>`
		select
			${applicationDisplayColumns},
			count(*) over()::int as "total"
		from applications a
		where ${sql.join(whereClauses, sql` and `)}
		order by a.application_date desc, a.created_at desc, a.id
		limit ${input.limit}
		offset ${input.offset}
	`.execute(db);

	return {
		total: result.rows[0]?.total ?? 0,
		rows: result.rows,
	};
}

export async function getApplicationDisplayRowById(
	db: Kysely<SimmerDatabase>,
	input: ApplicationByIdInput,
): Promise<SafeApplicationDisplayRow | undefined> {
	const result = await sql<SafeApplicationDisplayRow>`
		select ${applicationDisplayColumns}
		from applications a
		where a.id = ${input.id}
			and a.organization_id = ${input.organizationId}
			and a.deleted_at is null
		limit 1
	`.execute(db);

	return result.rows[0];
}

// Shared projection for the paged list + by-id readers. Kept as one fragment so
// the two paths can never drift in shape.
const applicationDisplayColumns = sql`
	a.id,
	a.organization_id as "organizationId",
	a.lat,
	a.lng,
	a.geojson,
	a.geom_type as "geomType",
	a.insecticide_id as "insecticideId",
	a.application_method_id as "applicationMethodId",
	a.application_date::text as "applicationDate",
	a.amount_applied as "amountApplied",
	a.application_unit_id as "applicationUnitId",
	a.habitat_id as "habitatId",
	a.created_at as "createdAt",
	a.updated_at as "updatedAt"
`;

// --- source reduction -------------------------------------------------------

export interface SourceReductionMapFilters {
	readonly sourceReductionMethodIds?: readonly string[];
	/** Inclusive lower bound on `source_reduction_date` (`YYYY-MM-DD`). */
	readonly dateFrom?: string;
	/** Inclusive upper bound on `source_reduction_date` (`YYYY-MM-DD`). */
	readonly dateTo?: string;
}

export interface SourceReductionMvtTileInput {
	readonly z: number;
	readonly x: number;
	readonly y: number;
	readonly organizationId: string;
	readonly filters?: SourceReductionMapFilters;
}

export interface SourceReductionPageInput {
	readonly organizationId: string;
	readonly filters?: SourceReductionMapFilters;
	readonly limit: number;
	readonly offset: number;
}

export interface SourceReductionByIdInput {
	readonly organizationId: string;
	readonly id: string;
}

export interface SafeSourceReductionDisplayRow {
	readonly id: string;
	readonly organizationId: string;
	readonly lat: number;
	readonly lng: number;
	readonly geojson: GeoJsonGeometry;
	readonly geomType: string;
	readonly sourceReductionMethodId: string;
	readonly sourceReductionDate: string;
	readonly sourcesEliminatedAmount: number;
	readonly sourcesEliminatedUnitId: string;
	readonly habitatId: string | null;
	readonly inspectionId: string | null;
	readonly createdAt: Date;
	readonly updatedAt: Date;
}

export interface SourceReductionPageResult {
	readonly total: number;
	readonly rows: SafeSourceReductionDisplayRow[];
}

function sourceReductionFilterWhere(
	filters: SourceReductionMapFilters | undefined,
): RawBuilder<boolean>[] {
	const clauses: RawBuilder<boolean>[] = [];
	if (
		filters?.sourceReductionMethodIds !== undefined &&
		filters.sourceReductionMethodIds.length > 0
	) {
		clauses.push(
			sql<boolean>`sr.source_reduction_method_id = any(${[...filters.sourceReductionMethodIds]}::uuid[])`,
		);
	}
	if (filters?.dateFrom !== undefined) {
		clauses.push(sql<boolean>`sr.source_reduction_date >= ${filters.dateFrom}`);
	}
	if (filters?.dateTo !== undefined) {
		clauses.push(sql<boolean>`sr.source_reduction_date <= ${filters.dateTo}`);
	}
	return clauses;
}

export async function getSourceReductionMvtTile(
	db: Kysely<SimmerDatabase>,
	input: SourceReductionMvtTileInput,
): Promise<Uint8Array> {
	const whereClauses: RawBuilder<boolean>[] = [
		sql<boolean>`sr.organization_id = ${input.organizationId}`,
		sql<boolean>`sr.deleted_at is null`,
		sql<boolean>`sr.geom && bounds.geom_4326`,
		sql<boolean>`st_intersects(sr.geom, bounds.geom_4326)`,
		...sourceReductionFilterWhere(input.filters),
	];

	const result = await sql<{ readonly tile: Uint8Array | null }>`
		with
		${tileEnvelopeCte(input)},
		tile_rows as (
			select
				sr.id,
				st_asmvtgeom(
					st_transform(sr.geom, 3857),
					bounds.geom_3857,
					extent => ${mvtExtent},
					buffer => ${mvtBuffer}
				) as geom
			from source_reductions sr
			cross join bounds
			where ${sql.join(whereClauses, sql` and `)}
		)
		select coalesce(st_asmvt(tile_rows, 'source-reduction', ${mvtExtent}, 'geom'), ''::bytea) as tile
		from tile_rows
	`.execute(db);

	return result.rows[0]?.tile ?? new Uint8Array();
}

export async function listSourceReductionDisplayRowsPage(
	db: Kysely<SimmerDatabase>,
	input: SourceReductionPageInput,
): Promise<SourceReductionPageResult> {
	const whereClauses: RawBuilder<boolean>[] = [
		sql<boolean>`sr.organization_id = ${input.organizationId}`,
		sql<boolean>`sr.deleted_at is null`,
		...sourceReductionFilterWhere(input.filters),
	];

	const result = await sql<SafeSourceReductionDisplayRow & { readonly total: number }>`
		select
			${sourceReductionDisplayColumns},
			count(*) over()::int as "total"
		from source_reductions sr
		where ${sql.join(whereClauses, sql` and `)}
		order by sr.source_reduction_date desc, sr.created_at desc, sr.id
		limit ${input.limit}
		offset ${input.offset}
	`.execute(db);

	return {
		total: result.rows[0]?.total ?? 0,
		rows: result.rows,
	};
}

export async function getSourceReductionDisplayRowById(
	db: Kysely<SimmerDatabase>,
	input: SourceReductionByIdInput,
): Promise<SafeSourceReductionDisplayRow | undefined> {
	const result = await sql<SafeSourceReductionDisplayRow>`
		select ${sourceReductionDisplayColumns}
		from source_reductions sr
		where sr.id = ${input.id}
			and sr.organization_id = ${input.organizationId}
			and sr.deleted_at is null
		limit 1
	`.execute(db);

	return result.rows[0];
}

const sourceReductionDisplayColumns = sql`
	sr.id,
	sr.organization_id as "organizationId",
	sr.lat,
	sr.lng,
	sr.geojson,
	sr.geom_type as "geomType",
	sr.source_reduction_method_id as "sourceReductionMethodId",
	sr.source_reduction_date::text as "sourceReductionDate",
	sr.sources_eliminated_amount as "sourcesEliminatedAmount",
	sr.sources_eliminated_unit_id as "sourcesEliminatedUnitId",
	sr.habitat_id as "habitatId",
	sr.inspection_id as "inspectionId",
	sr.created_at as "createdAt",
	sr.updated_at as "updatedAt"
`;

// --- biocontrol -------------------------------------------------------------

export interface BiocontrolMapFilters {
	readonly biocontrolMethodIds?: readonly string[];
	/** Only actions linked to a habitat. */
	readonly habitatLinkedOnly?: boolean;
	/** Inclusive lower bound on `biocontrol_date` (`YYYY-MM-DD`). */
	readonly dateFrom?: string;
	/** Inclusive upper bound on `biocontrol_date` (`YYYY-MM-DD`). */
	readonly dateTo?: string;
}

export interface BiocontrolMvtTileInput {
	readonly z: number;
	readonly x: number;
	readonly y: number;
	readonly organizationId: string;
	readonly filters?: BiocontrolMapFilters;
}

export interface BiocontrolPageInput {
	readonly organizationId: string;
	readonly filters?: BiocontrolMapFilters;
	readonly limit: number;
	readonly offset: number;
}

export interface BiocontrolByIdInput {
	readonly organizationId: string;
	readonly id: string;
}

export interface SafeBiocontrolDisplayRow {
	readonly id: string;
	readonly organizationId: string;
	readonly lat: number;
	readonly lng: number;
	readonly geojson: GeoJsonGeometry;
	readonly geomType: string;
	readonly biocontrolMethodId: string;
	readonly biocontrolDate: string;
	readonly amountReleased: number;
	readonly releaseUnitId: string;
	readonly habitatId: string | null;
	readonly inspectionId: string | null;
	readonly createdAt: Date;
	readonly updatedAt: Date;
}

export interface BiocontrolPageResult {
	readonly total: number;
	readonly rows: SafeBiocontrolDisplayRow[];
}

function biocontrolFilterWhere(filters: BiocontrolMapFilters | undefined): RawBuilder<boolean>[] {
	const clauses: RawBuilder<boolean>[] = [];
	if (filters?.biocontrolMethodIds !== undefined && filters.biocontrolMethodIds.length > 0) {
		clauses.push(
			sql<boolean>`ba.biocontrol_method_id = any(${[...filters.biocontrolMethodIds]}::uuid[])`,
		);
	}
	if (filters?.habitatLinkedOnly === true) {
		clauses.push(sql<boolean>`ba.habitat_id is not null`);
	}
	if (filters?.dateFrom !== undefined) {
		clauses.push(sql<boolean>`ba.biocontrol_date >= ${filters.dateFrom}`);
	}
	if (filters?.dateTo !== undefined) {
		clauses.push(sql<boolean>`ba.biocontrol_date <= ${filters.dateTo}`);
	}
	return clauses;
}

export async function getBiocontrolMvtTile(
	db: Kysely<SimmerDatabase>,
	input: BiocontrolMvtTileInput,
): Promise<Uint8Array> {
	const whereClauses: RawBuilder<boolean>[] = [
		sql<boolean>`ba.organization_id = ${input.organizationId}`,
		sql<boolean>`ba.deleted_at is null`,
		sql<boolean>`ba.geom && bounds.geom_4326`,
		sql<boolean>`st_intersects(ba.geom, bounds.geom_4326)`,
		...biocontrolFilterWhere(input.filters),
	];

	const result = await sql<{ readonly tile: Uint8Array | null }>`
		with
		${tileEnvelopeCte(input)},
		tile_rows as (
			select
				ba.id,
				st_asmvtgeom(
					st_transform(ba.geom, 3857),
					bounds.geom_3857,
					extent => ${mvtExtent},
					buffer => ${mvtBuffer}
				) as geom
			from biocontrol_actions ba
			cross join bounds
			where ${sql.join(whereClauses, sql` and `)}
		)
		select coalesce(st_asmvt(tile_rows, 'biocontrol', ${mvtExtent}, 'geom'), ''::bytea) as tile
		from tile_rows
	`.execute(db);

	return result.rows[0]?.tile ?? new Uint8Array();
}

export async function listBiocontrolDisplayRowsPage(
	db: Kysely<SimmerDatabase>,
	input: BiocontrolPageInput,
): Promise<BiocontrolPageResult> {
	const whereClauses: RawBuilder<boolean>[] = [
		sql<boolean>`ba.organization_id = ${input.organizationId}`,
		sql<boolean>`ba.deleted_at is null`,
		...biocontrolFilterWhere(input.filters),
	];

	const result = await sql<SafeBiocontrolDisplayRow & { readonly total: number }>`
		select
			${biocontrolDisplayColumns},
			count(*) over()::int as "total"
		from biocontrol_actions ba
		where ${sql.join(whereClauses, sql` and `)}
		order by ba.biocontrol_date desc, ba.created_at desc, ba.id
		limit ${input.limit}
		offset ${input.offset}
	`.execute(db);

	return {
		total: result.rows[0]?.total ?? 0,
		rows: result.rows,
	};
}

export async function getBiocontrolDisplayRowById(
	db: Kysely<SimmerDatabase>,
	input: BiocontrolByIdInput,
): Promise<SafeBiocontrolDisplayRow | undefined> {
	const result = await sql<SafeBiocontrolDisplayRow>`
		select ${biocontrolDisplayColumns}
		from biocontrol_actions ba
		where ba.id = ${input.id}
			and ba.organization_id = ${input.organizationId}
			and ba.deleted_at is null
		limit 1
	`.execute(db);

	return result.rows[0];
}

const biocontrolDisplayColumns = sql`
	ba.id,
	ba.organization_id as "organizationId",
	ba.lat,
	ba.lng,
	ba.geojson,
	ba.geom_type as "geomType",
	ba.biocontrol_method_id as "biocontrolMethodId",
	ba.biocontrol_date::text as "biocontrolDate",
	ba.amount_released as "amountReleased",
	ba.release_unit_id as "releaseUnitId",
	ba.habitat_id as "habitatId",
	ba.inspection_id as "inspectionId",
	ba.created_at as "createdAt",
	ba.updated_at as "updatedAt"
`;
