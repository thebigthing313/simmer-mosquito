import { type Kysely, type RawBuilder, sql } from 'kysely';

import type { GeoJsonGeometry, SimmerDatabase } from '../index.js';
import type { MapTilesetLayer } from './map-layers.js';
import { regionMembershipClauses } from './map-region-filter.js';
import {
	type MapByIdInput,
	type MapDisplayColumns,
	type MapRecordSurfaceReaders,
	mapDisplaySelectList,
	mapRecordSurface,
} from './map-surface.js';

// --- control-operations map surfaces ----------------------------------------
//
// Mirrors the larval map trio (tile / paged list / by-id) for the chemical,
// source-reduction, and biocontrol explorers. Each of these records carries its
// own owned point/line/polygon geometry, so it is spatially queryable exactly
// like a habitat. The vector tiles stream the whole viewport unbounded; the list
// reads a filtered, offset-paged window (no bbox) so the explorer's result rail
// is never an unbounded query. Lookup names (insecticide, method, unit) resolve
// client-side from the eager catalog, so only ids ride in the display rows.
//
// The four surfaces differ only in their table, their projection, and their
// filters; the organization scope and the four read shapes come from
// `mapSurface`.

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

const applicationDisplayColumns: MapDisplayColumns<SafeApplicationDisplayRow> = {
	id: sql`a.id`,
	organizationId: sql`a.organization_id`,
	lat: sql`a.lat`,
	lng: sql`a.lng`,
	geojson: sql`a.geojson`,
	geomType: sql`a.geom_type`,
	insecticideId: sql`a.insecticide_id`,
	applicationMethodId: sql`a.application_method_id`,
	applicationDate: sql`a.application_date::text`,
	amountApplied: sql`a.amount_applied`,
	applicationUnitId: sql`a.application_unit_id`,
	habitatId: sql`a.habitat_id`,
	applicatorProfileId: sql`a.applicator_profile_id`,
	applicatorName: sql`ap.display_name`,
	batchNames: sql`coalesce(batches.batch_names, '[]'::json)`,
	createdAt: sql`a.created_at`,
	updatedAt: sql`a.updated_at`,
};

/**
 * The applications map surface, with the layer it stamps into its tiles handed in by
 * the register it is declared in.
 */
export function applicationSurface(
	layer: MapTilesetLayer,
): MapRecordSurfaceReaders<ApplicationMapFilters, SafeApplicationDisplayRow> {
	return mapRecordSurface<ApplicationMapFilters, SafeApplicationDisplayRow>({
		layer,
		from: sql`applications a`,
		alias: 'a',
		geom: sql`a.geom`,
		properties: [sql`a.id`],
		filterWhere: applicationFilterWhere,
		display: {
			columns: applicationDisplayColumns,
			joins: applicationDisplayJoins,
			orderBy: sql`a.application_date desc, a.created_at desc, a.id`,
		},
	});
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
			geomType: sql`a.geom_type`,
			organizationId: sql`a.organization_id`,
			regionIds: filters?.regionIds,
		}),
	);
	return clauses;
}

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
	/** Who did the work, when the organization records it. */
	readonly technicianProfileId: string | null;
	readonly habitatId: string | null;
	readonly inspectionId: string | null;
	readonly createdAt: Date;
	readonly updatedAt: Date;
}

const sourceReductionDisplayColumns: MapDisplayColumns<SafeSourceReductionDisplayRow> = {
	id: sql`sr.id`,
	organizationId: sql`sr.organization_id`,
	lat: sql`sr.lat`,
	lng: sql`sr.lng`,
	geojson: sql`sr.geojson`,
	geomType: sql`sr.geom_type`,
	sourceReductionMethodId: sql`sr.source_reduction_method_id`,
	sourceReductionDate: sql`sr.source_reduction_date::text`,
	sourcesEliminatedAmount: sql`sr.sources_eliminated_amount`,
	sourcesEliminatedUnitId: sql`sr.sources_eliminated_unit_id`,
	technicianProfileId: sql`sr.technician_profile_id`,
	habitatId: sql`sr.habitat_id`,
	inspectionId: sql`sr.inspection_id`,
	createdAt: sql`sr.created_at`,
	updatedAt: sql`sr.updated_at`,
};

/**
 * The source reductions map surface, with the layer it stamps into its tiles handed in by
 * the register it is declared in.
 */
export function sourceReductionSurface(
	layer: MapTilesetLayer,
): MapRecordSurfaceReaders<SourceReductionMapFilters, SafeSourceReductionDisplayRow> {
	return mapRecordSurface<SourceReductionMapFilters, SafeSourceReductionDisplayRow>({
		layer,
		from: sql`source_reductions sr`,
		alias: 'sr',
		geom: sql`sr.geom`,
		properties: [sql`sr.id`],
		filterWhere: sourceReductionFilterWhere,
		display: {
			columns: sourceReductionDisplayColumns,
			orderBy: sql`sr.source_reduction_date desc, sr.created_at desc, sr.id`,
		},
	});
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
			geomType: sql`sr.geom_type`,
			organizationId: sql`sr.organization_id`,
			regionIds: filters?.regionIds,
		}),
	);
	return clauses;
}

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
	/** Who did the release, when the organization records it. */
	readonly technicianProfileId: string | null;
	readonly habitatId: string | null;
	readonly inspectionId: string | null;
	readonly createdAt: Date;
	readonly updatedAt: Date;
}

const biocontrolDisplayColumns: MapDisplayColumns<SafeBiocontrolDisplayRow> = {
	id: sql`ba.id`,
	organizationId: sql`ba.organization_id`,
	lat: sql`ba.lat`,
	lng: sql`ba.lng`,
	geojson: sql`ba.geojson`,
	geomType: sql`ba.geom_type`,
	biocontrolMethodId: sql`ba.biocontrol_method_id`,
	biocontrolDate: sql`ba.biocontrol_date::text`,
	amountReleased: sql`ba.amount_released`,
	releaseUnitId: sql`ba.release_unit_id`,
	technicianProfileId: sql`ba.technician_profile_id`,
	habitatId: sql`ba.habitat_id`,
	inspectionId: sql`ba.inspection_id`,
	createdAt: sql`ba.created_at`,
	updatedAt: sql`ba.updated_at`,
};

/**
 * The biocontrol actions map surface, with the layer it stamps into its tiles handed in by
 * the register it is declared in.
 */
export function biocontrolSurface(
	layer: MapTilesetLayer,
): MapRecordSurfaceReaders<BiocontrolMapFilters, SafeBiocontrolDisplayRow> {
	return mapRecordSurface<BiocontrolMapFilters, SafeBiocontrolDisplayRow>({
		layer,
		from: sql`biocontrol_actions ba`,
		alias: 'ba',
		geom: sql`ba.geom`,
		properties: [sql`ba.id`],
		filterWhere: biocontrolFilterWhere,
		display: {
			columns: biocontrolDisplayColumns,
			orderBy: sql`ba.biocontrol_date desc, ba.created_at desc, ba.id`,
		},
	});
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
			geomType: sql`ba.geom_type`,
			organizationId: sql`ba.organization_id`,
			regionIds: filters?.regionIds,
		}),
	);
	return clauses;
}

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

const outreachDisplayColumns: MapDisplayColumns<SafeOutreachDisplayRow> = {
	id: sql`oa.id`,
	organizationId: sql`oa.organization_id`,
	lat: sql`oa.lat`,
	lng: sql`oa.lng`,
	geojson: sql`oa.geojson`,
	geomType: sql`oa.geom_type`,
	outreachMethodId: sql`oa.outreach_method_id`,
	outreachDate: sql`oa.outreach_date::text`,
	reach: sql`oa.reach`,
	reachDescription: sql`oa.reach_description`,
	technicianProfileId: sql`oa.technician_profile_id`,
	addressId: sql`oa.address_id`,
	inspectionId: sql`oa.inspection_id`,
	createdAt: sql`oa.created_at`,
	updatedAt: sql`oa.updated_at`,
};

/**
 * The outreach actions map surface, with the layer it stamps into its tiles handed in by
 * the register it is declared in.
 */
export function outreachSurface(
	layer: MapTilesetLayer,
): MapRecordSurfaceReaders<OutreachMapFilters, SafeOutreachDisplayRow> {
	return mapRecordSurface<OutreachMapFilters, SafeOutreachDisplayRow>({
		layer,
		from: sql`outreach_actions oa`,
		alias: 'oa',
		geom: sql`oa.geom`,
		properties: [sql`oa.id`],
		filterWhere: outreachFilterWhere,
		display: {
			columns: outreachDisplayColumns,
			orderBy: sql`oa.outreach_date desc, oa.created_at desc, oa.id`,
		},
	});
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
			geomType: sql`oa.geom_type`,
			organizationId: sql`oa.organization_id`,
			regionIds: filters?.regionIds,
		}),
	);
	return clauses;
}

// --- requested control actions ----------------------------------------------
//
// Requests carry owned geometry like the performed actions above, but no map
// explorer of their own: the queue is read from the Electric shape, which
// streams the centroid and nothing else (ADR 0009). What is missing there is the
// shape itself, so this is a by-id geometry read rather than the usual trio —
// no tile, no paged list, and no filters to build them from.

export interface SafeRequestedControlActionDisplayRow {
	readonly id: string;
	readonly organizationId: string;
	readonly lat: number;
	readonly lng: number;
	readonly geojson: GeoJsonGeometry;
	readonly geomType: string;
	readonly updatedAt: Date;
}

const requestedControlActionDisplayColumns: MapDisplayColumns<SafeRequestedControlActionDisplayRow> =
	{
		id: sql`rca.id`,
		organizationId: sql`rca.organization_id`,
		lat: sql`rca.lat`,
		lng: sql`rca.lng`,
		geojson: sql`rca.geojson`,
		geomType: sql`rca.geom_type`,
		updatedAt: sql`rca.updated_at`,
	};

export async function getRequestedControlActionDisplayRowById(
	db: Kysely<SimmerDatabase>,
	input: MapByIdInput,
): Promise<SafeRequestedControlActionDisplayRow | undefined> {
	const result = await sql<SafeRequestedControlActionDisplayRow>`
		select ${mapDisplaySelectList(requestedControlActionDisplayColumns)}
		from requested_control_actions rca
		where rca.id = ${input.id}
			and rca.organization_id = ${input.organizationId}
			and rca.deleted_at is null
		limit 1
	`.execute(db);

	return result.rows[0];
}
