import { type Kysely, type RawBuilder, sql } from 'kysely';

import type { GeoJsonGeometry, SimmerDatabase } from '../index.js';
import { type MapExtent, readMapExtent } from './map-extent.js';
import { regionMembershipClauses } from './map-region-filter.js';
import { readMapTile } from './map-tile.js';

// --- control-operations map surfaces ----------------------------------------
//
// Mirrors the larval map trio (tile / paged list / by-id) for the chemical,
// source-reduction, and biocontrol explorers. Each of these records carries its
// own owned point/line/polygon geometry, so it is spatially queryable exactly
// like a habitat. The vector tiles stream the whole viewport unbounded; the list
// reads a filtered, offset-paged window (no bbox) so the explorer's result rail
// is never an unbounded query. Lookup names (insecticide, method, unit) resolve
// client-side from the eager catalog, so only ids ride in the display rows.

// --- chemical applications --------------------------------------------------

export interface ApplicationMapFilters {
	readonly insecticideIds?: readonly string[];
	readonly applicationMethodIds?: readonly string[];
	/** Match applications performed by any of these profiles. */
	readonly applicatorProfileIds?: readonly string[];
	/** Match applications falling inside any of these regions. */
	readonly regionIds?: readonly string[];
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
	readonly applicatorProfileId: string | null;
	readonly applicatorName: string | null;
	/** Batch names of the insecticide batches recorded against this application. */
	readonly batchNames: string[];
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
	if (filters?.applicatorProfileIds !== undefined && filters.applicatorProfileIds.length > 0) {
		clauses.push(
			sql<boolean>`a.applicator_profile_id = any(${[...filters.applicatorProfileIds]}::uuid[])`,
		);
	}
	if (filters?.dateFrom !== undefined) {
		clauses.push(sql<boolean>`a.application_date >= ${filters.dateFrom}`);
	}
	if (filters?.dateTo !== undefined) {
		clauses.push(sql<boolean>`a.application_date <= ${filters.dateTo}`);
	}
	clauses.push(
		...regionMembershipClauses({
			geom: sql`a.geom`,
			organizationId: sql`a.organization_id`,
			regionIds: filters?.regionIds,
		}),
	);
	return clauses;
}

export async function getApplicationMvtTile(
	db: Kysely<SimmerDatabase>,
	input: ApplicationMvtTileInput,
): Promise<Uint8Array> {
	return readMapTile(db, {
		z: input.z,
		x: input.x,
		y: input.y,
		layer: 'chemical',
		from: sql`applications a`,
		geom: sql`a.geom`,
		properties: [sql`a.id`],
		where: [
			sql`a.organization_id = ${input.organizationId}`,
			sql`a.deleted_at is null`,
			sql`a.geom && bounds.geom_4326`,
			sql`st_intersects(a.geom, bounds.geom_4326)`,
			...applicationFilterWhere(input.filters),
		],
	});
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
		${applicationDisplayJoins}
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
		${applicationDisplayJoins}
		where a.id = ${input.id}
			and a.organization_id = ${input.organizationId}
			and a.deleted_at is null
		limit 1
	`.execute(db);

	return result.rows[0];
}

/**
 * Extent of every application matching the map filters, ignoring the viewport —
 * what the explorer map frames on load and after a filter change.
 */
export async function getApplicationMapExtent(
	db: Kysely<SimmerDatabase>,
	input: { readonly organizationId: string; readonly filters?: ApplicationMapFilters },
): Promise<MapExtent | null> {
	return readMapExtent(db, {
		geom: sql`a.geom`,
		from: sql`applications a`,
		where: [
			sql<boolean>`a.organization_id = ${input.organizationId}`,
			sql<boolean>`a.deleted_at is null`,
			...applicationFilterWhere(input.filters),
		],
	});
}

// Applicator name + batch-name roll-up, kept as one fragment so the paged list
// and by-id readers can never drift in their joins.
const applicationDisplayJoins = sql`
	left join profiles ap on ap.id = a.applicator_profile_id
	left join lateral (
		select json_agg(ib.batch_name order by ib.batch_name) as batch_names
		from application_batches abx
		join insecticide_batches ib on ib.id = abx.insecticide_batch_id
		where abx.application_id = a.id
			and abx.deleted_at is null
			and ib.deleted_at is null
	) batches on true
`;

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
	a.applicator_profile_id as "applicatorProfileId",
	ap.display_name as "applicatorName",
	coalesce(batches.batch_names, '[]'::json) as "batchNames",
	a.created_at as "createdAt",
	a.updated_at as "updatedAt"
`;

// --- source reduction -------------------------------------------------------

export interface SourceReductionMapFilters {
	readonly sourceReductionMethodIds?: readonly string[];
	/** Match source reduction performed by any of these profiles. */
	readonly technicianProfileIds?: readonly string[];
	/** Match source reduction falling inside any of these regions. */
	readonly regionIds?: readonly string[];
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
	if (filters?.technicianProfileIds !== undefined && filters.technicianProfileIds.length > 0) {
		clauses.push(
			sql<boolean>`sr.technician_profile_id = any(${[...filters.technicianProfileIds]}::uuid[])`,
		);
	}
	if (filters?.dateFrom !== undefined) {
		clauses.push(sql<boolean>`sr.source_reduction_date >= ${filters.dateFrom}`);
	}
	if (filters?.dateTo !== undefined) {
		clauses.push(sql<boolean>`sr.source_reduction_date <= ${filters.dateTo}`);
	}
	clauses.push(
		...regionMembershipClauses({
			geom: sql`sr.geom`,
			organizationId: sql`sr.organization_id`,
			regionIds: filters?.regionIds,
		}),
	);
	return clauses;
}

export async function getSourceReductionMvtTile(
	db: Kysely<SimmerDatabase>,
	input: SourceReductionMvtTileInput,
): Promise<Uint8Array> {
	return readMapTile(db, {
		z: input.z,
		x: input.x,
		y: input.y,
		layer: 'source-reduction',
		from: sql`source_reductions sr`,
		geom: sql`sr.geom`,
		properties: [sql`sr.id`],
		where: [
			sql`sr.organization_id = ${input.organizationId}`,
			sql`sr.deleted_at is null`,
			sql`sr.geom && bounds.geom_4326`,
			sql`st_intersects(sr.geom, bounds.geom_4326)`,
			...sourceReductionFilterWhere(input.filters),
		],
	});
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

/**
 * Extent of every source reduction matching the map filters, ignoring the
 * viewport — what the explorer map frames on load and after a filter change.
 */
export async function getSourceReductionMapExtent(
	db: Kysely<SimmerDatabase>,
	input: { readonly organizationId: string; readonly filters?: SourceReductionMapFilters },
): Promise<MapExtent | null> {
	return readMapExtent(db, {
		geom: sql`sr.geom`,
		from: sql`source_reductions sr`,
		where: [
			sql<boolean>`sr.organization_id = ${input.organizationId}`,
			sql<boolean>`sr.deleted_at is null`,
			...sourceReductionFilterWhere(input.filters),
		],
	});
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
	sr.technician_profile_id as "technicianProfileId",
	sr.habitat_id as "habitatId",
	sr.inspection_id as "inspectionId",
	sr.created_at as "createdAt",
	sr.updated_at as "updatedAt"
`;

// --- biocontrol -------------------------------------------------------------

export interface BiocontrolMapFilters {
	readonly biocontrolMethodIds?: readonly string[];
	/** Match releases performed by any of these profiles. */
	readonly technicianProfileIds?: readonly string[];
	/** Only actions linked to a habitat. */
	readonly habitatLinkedOnly?: boolean;
	/** Match releases falling inside any of these regions. */
	readonly regionIds?: readonly string[];
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
	if (filters?.technicianProfileIds !== undefined && filters.technicianProfileIds.length > 0) {
		clauses.push(
			sql<boolean>`ba.technician_profile_id = any(${[...filters.technicianProfileIds]}::uuid[])`,
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
	clauses.push(
		...regionMembershipClauses({
			geom: sql`ba.geom`,
			organizationId: sql`ba.organization_id`,
			regionIds: filters?.regionIds,
		}),
	);
	return clauses;
}

export async function getBiocontrolMvtTile(
	db: Kysely<SimmerDatabase>,
	input: BiocontrolMvtTileInput,
): Promise<Uint8Array> {
	return readMapTile(db, {
		z: input.z,
		x: input.x,
		y: input.y,
		layer: 'biocontrol',
		from: sql`biocontrol_actions ba`,
		geom: sql`ba.geom`,
		properties: [sql`ba.id`],
		where: [
			sql`ba.organization_id = ${input.organizationId}`,
			sql`ba.deleted_at is null`,
			sql`ba.geom && bounds.geom_4326`,
			sql`st_intersects(ba.geom, bounds.geom_4326)`,
			...biocontrolFilterWhere(input.filters),
		],
	});
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

/**
 * Extent of every biocontrol action matching the map filters, ignoring the
 * viewport — what the explorer map frames on load and after a filter change.
 */
export async function getBiocontrolMapExtent(
	db: Kysely<SimmerDatabase>,
	input: { readonly organizationId: string; readonly filters?: BiocontrolMapFilters },
): Promise<MapExtent | null> {
	return readMapExtent(db, {
		geom: sql`ba.geom`,
		from: sql`biocontrol_actions ba`,
		where: [
			sql<boolean>`ba.organization_id = ${input.organizationId}`,
			sql<boolean>`ba.deleted_at is null`,
			...biocontrolFilterWhere(input.filters),
		],
	});
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
	ba.technician_profile_id as "technicianProfileId",
	ba.habitat_id as "habitatId",
	ba.inspection_id as "inspectionId",
	ba.created_at as "createdAt",
	ba.updated_at as "updatedAt"
`;

// --- outreach ---------------------------------------------------------------
//
// Outreach is performed control work that the public-engagement side of the app
// explores, so it reads through the same tile / page / by-id trio as its sibling
// control actions. It carries no habitat link (docs/control-operations-domain.md
// keeps `habitat_id` off outreach for v1), so the context narrowing the other
// explorers offer stops at the inspection it may have come from.

export interface OutreachMapFilters {
	readonly outreachMethodIds?: readonly string[];
	/** Match outreach performed by any of these profiles. */
	readonly technicianProfileIds?: readonly string[];
	/** Match outreach falling inside any of these regions. */
	readonly regionIds?: readonly string[];
	/** Inclusive lower bound on `outreach_date` (`YYYY-MM-DD`). */
	readonly dateFrom?: string;
	/** Inclusive upper bound on `outreach_date` (`YYYY-MM-DD`). */
	readonly dateTo?: string;
}

export interface OutreachMvtTileInput {
	readonly z: number;
	readonly x: number;
	readonly y: number;
	readonly organizationId: string;
	readonly filters?: OutreachMapFilters;
}

export interface OutreachPageInput {
	readonly organizationId: string;
	readonly filters?: OutreachMapFilters;
	readonly limit: number;
	readonly offset: number;
}

export interface OutreachByIdInput {
	readonly organizationId: string;
	readonly id: string;
}

export interface SafeOutreachDisplayRow {
	readonly id: string;
	readonly organizationId: string;
	readonly lat: number;
	readonly lng: number;
	readonly geojson: GeoJsonGeometry;
	readonly geomType: string;
	readonly outreachMethodId: string;
	readonly outreachDate: string;
	readonly reach: number;
	readonly reachDescription: string | null;
	readonly technicianProfileId: string | null;
	readonly addressId: string | null;
	readonly inspectionId: string | null;
	readonly createdAt: Date;
	readonly updatedAt: Date;
}

export interface OutreachPageResult {
	readonly total: number;
	readonly rows: SafeOutreachDisplayRow[];
}

function outreachFilterWhere(filters: OutreachMapFilters | undefined): RawBuilder<boolean>[] {
	const clauses: RawBuilder<boolean>[] = [];
	if (filters?.outreachMethodIds !== undefined && filters.outreachMethodIds.length > 0) {
		clauses.push(
			sql<boolean>`oa.outreach_method_id = any(${[...filters.outreachMethodIds]}::uuid[])`,
		);
	}
	if (filters?.technicianProfileIds !== undefined && filters.technicianProfileIds.length > 0) {
		clauses.push(
			sql<boolean>`oa.technician_profile_id = any(${[...filters.technicianProfileIds]}::uuid[])`,
		);
	}
	if (filters?.dateFrom !== undefined) {
		clauses.push(sql<boolean>`oa.outreach_date >= ${filters.dateFrom}`);
	}
	if (filters?.dateTo !== undefined) {
		clauses.push(sql<boolean>`oa.outreach_date <= ${filters.dateTo}`);
	}
	clauses.push(
		...regionMembershipClauses({
			geom: sql`oa.geom`,
			organizationId: sql`oa.organization_id`,
			regionIds: filters?.regionIds,
		}),
	);
	return clauses;
}

export async function getOutreachMvtTile(
	db: Kysely<SimmerDatabase>,
	input: OutreachMvtTileInput,
): Promise<Uint8Array> {
	return readMapTile(db, {
		z: input.z,
		x: input.x,
		y: input.y,
		layer: 'outreach',
		from: sql`outreach_actions oa`,
		geom: sql`oa.geom`,
		properties: [sql`oa.id`],
		where: [
			sql`oa.organization_id = ${input.organizationId}`,
			sql`oa.deleted_at is null`,
			sql`oa.geom && bounds.geom_4326`,
			sql`st_intersects(oa.geom, bounds.geom_4326)`,
			...outreachFilterWhere(input.filters),
		],
	});
}

export async function listOutreachDisplayRowsPage(
	db: Kysely<SimmerDatabase>,
	input: OutreachPageInput,
): Promise<OutreachPageResult> {
	const whereClauses: RawBuilder<boolean>[] = [
		sql<boolean>`oa.organization_id = ${input.organizationId}`,
		sql<boolean>`oa.deleted_at is null`,
		...outreachFilterWhere(input.filters),
	];

	const result = await sql<SafeOutreachDisplayRow & { readonly total: number }>`
		select
			${outreachDisplayColumns},
			count(*) over()::int as "total"
		from outreach_actions oa
		where ${sql.join(whereClauses, sql` and `)}
		order by oa.outreach_date desc, oa.created_at desc, oa.id
		limit ${input.limit}
		offset ${input.offset}
	`.execute(db);

	return {
		total: result.rows[0]?.total ?? 0,
		rows: result.rows,
	};
}

export async function getOutreachDisplayRowById(
	db: Kysely<SimmerDatabase>,
	input: OutreachByIdInput,
): Promise<SafeOutreachDisplayRow | undefined> {
	const result = await sql<SafeOutreachDisplayRow>`
		select ${outreachDisplayColumns}
		from outreach_actions oa
		where oa.id = ${input.id}
			and oa.organization_id = ${input.organizationId}
			and oa.deleted_at is null
		limit 1
	`.execute(db);

	return result.rows[0];
}

/**
 * Extent of every outreach action matching the map filters, ignoring the
 * viewport — what the explorer map frames on load and after a filter change.
 */
export async function getOutreachMapExtent(
	db: Kysely<SimmerDatabase>,
	input: { readonly organizationId: string; readonly filters?: OutreachMapFilters },
): Promise<MapExtent | null> {
	return readMapExtent(db, {
		geom: sql`oa.geom`,
		from: sql`outreach_actions oa`,
		where: [
			sql<boolean>`oa.organization_id = ${input.organizationId}`,
			sql<boolean>`oa.deleted_at is null`,
			...outreachFilterWhere(input.filters),
		],
	});
}

const outreachDisplayColumns = sql`
	oa.id,
	oa.organization_id as "organizationId",
	oa.lat,
	oa.lng,
	oa.geojson,
	oa.geom_type as "geomType",
	oa.outreach_method_id as "outreachMethodId",
	oa.outreach_date::text as "outreachDate",
	oa.reach,
	oa.reach_description as "reachDescription",
	oa.technician_profile_id as "technicianProfileId",
	oa.address_id as "addressId",
	oa.inspection_id as "inspectionId",
	oa.created_at as "createdAt",
	oa.updated_at as "updatedAt"
`;

// --- requested control actions ----------------------------------------------
//
// Requests carry owned geometry like the performed actions above, but no map
// explorer of their own: the queue is read from the Electric shape, which
// streams the centroid and nothing else (ADR 0009). What is missing there is the
// shape itself, so this is a by-id geometry read rather than the usual trio —
// no tile, no paged list, and no filters to build them from.

export interface RequestedControlActionByIdInput {
	readonly organizationId: string;
	readonly id: string;
}

export interface SafeRequestedControlActionDisplayRow {
	readonly id: string;
	readonly organizationId: string;
	readonly lat: number;
	readonly lng: number;
	readonly geojson: GeoJsonGeometry;
	readonly geomType: string;
	readonly updatedAt: Date;
}

export async function getRequestedControlActionDisplayRowById(
	db: Kysely<SimmerDatabase>,
	input: RequestedControlActionByIdInput,
): Promise<SafeRequestedControlActionDisplayRow | undefined> {
	const result = await sql<SafeRequestedControlActionDisplayRow>`
		select
			rca.id,
			rca.organization_id as "organizationId",
			rca.lat,
			rca.lng,
			rca.geojson,
			rca.geom_type as "geomType",
			rca.updated_at as "updatedAt"
		from requested_control_actions rca
		where rca.id = ${input.id}
			and rca.organization_id = ${input.organizationId}
			and rca.deleted_at is null
		limit 1
	`.execute(db);

	return result.rows[0];
}
