import { type Kysely, type RawBuilder, sql } from 'kysely';

import type { GeoJsonGeometry, SimmerDatabase } from '../index.js';
import type { MapExtent } from './map-extent.js';
import { regionMembershipClauses } from './map-region-filter.js';
import {
	type MapBounds,
	type MapBoundsPageInput,
	type MapByIdInput,
	type MapFilterInput,
	type MapPageResult,
	type MapTileInput,
	mapRecordSurface,
} from './map-surface.js';

/** One sample still awaiting species identification, with its inspection context. */
export interface AwaitingSampleRow {
	readonly id: string;
	readonly displayName: string | null;
	readonly inspectionDate: string;
	readonly habitatId: string | null;
	readonly habitatName: string | null;
	/** The parent inspection's centroid — what titles a sample with no habitat. */
	readonly lat: number | null;
	readonly lng: number | null;
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
			h.habitat_name as "habitatName",
			i.lat,
			i.lng
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
	/** Match inspections recorded by any of these profiles. */
	readonly inspectedByProfileIds?: readonly string[];
	/** Match inspections falling inside any of these regions. */
	readonly regionIds?: readonly string[];
	/** Inclusive lower bound on `inspection_date` (`YYYY-MM-DD`). */
	readonly dateFrom?: string;
	/** Inclusive upper bound on `inspection_date` (`YYYY-MM-DD`). */
	readonly dateTo?: string;
}

export type InspectionMvtTileInput = MapTileInput<InspectionMvtTileFilters>;
export type InspectionBounds = MapBounds;
export type InspectionBoundingBoxInput = MapBoundsPageInput<InspectionMvtTileFilters>;
export type InspectionByIdInput = MapByIdInput;

/** A page of inspection display rows plus the full count for the viewport + filters. */
export type InspectionDisplayPageResult = MapPageResult<SafeInspectionDisplayRow>;

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

// The habitat name, address label, and inspector name a row identifies itself
// with, kept as one fragment so the bbox and by-id readers cannot drift.
const inspectionDisplayJoins = sql`
	left join habitats h on h.id = i.habitat_id
	left join addresses a on a.id = i.address_id
	left join profiles p on p.id = i.inspected_by_profile_id
`;

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

const inspectionSurface = mapRecordSurface<InspectionMvtTileFilters, SafeInspectionDisplayRow>({
	layer: 'inspections',
	from: sql`inspections i`,
	alias: 'i',
	geom: sql`i.geom`,
	properties: [
		sql`i.id`,
		sql`i.is_wet as "isWet"`,
		sql`i.density::text as "density"`,
		sql`i.habitat_type_id as "habitatTypeId"`,
		sql`(
			i.has_eggs or i.has_first_instar or i.has_second_instar
			or i.has_third_instar or i.has_fourth_instar or i.has_pupae
		) as "positive"`,
	],
	filterWhere: inspectionFilterWhere,
	display: {
		columns: inspectionDisplayColumns,
		joins: inspectionDisplayJoins,
		orderBy: sql`i.inspection_date desc, i.created_at desc, i.id`,
	},
});

function inspectionFilterWhere(
	filters: InspectionMvtTileFilters | undefined,
): RawBuilder<boolean>[] {
	const whereClauses: RawBuilder<boolean>[] = [];

	if (filters?.isWet !== undefined) {
		whereClauses.push(sql<boolean>`i.is_wet = ${filters.isWet}`);
	}

	if (filters?.densities !== undefined && filters.densities.length > 0) {
		whereClauses.push(sql<boolean>`i.density = any(${[...filters.densities]}::larval_density[])`);
	}

	if (filters?.positiveOnly === true) {
		whereClauses.push(
			sql<boolean>`(
				i.has_eggs or i.has_first_instar or i.has_second_instar
				or i.has_third_instar or i.has_fourth_instar or i.has_pupae
			)`,
		);
	}

	if (filters?.habitatTypeIds !== undefined && filters.habitatTypeIds.length > 0) {
		whereClauses.push(
			sql<boolean>`i.habitat_type_id = any(${[...filters.habitatTypeIds]}::uuid[])`,
		);
	}

	if (filters?.inspectedByProfileIds !== undefined && filters.inspectedByProfileIds.length > 0) {
		whereClauses.push(
			sql<boolean>`i.inspected_by_profile_id = any(${[...filters.inspectedByProfileIds]}::uuid[])`,
		);
	}

	if (filters?.dateFrom !== undefined) {
		whereClauses.push(sql<boolean>`i.inspection_date >= ${filters.dateFrom}`);
	}

	if (filters?.dateTo !== undefined) {
		whereClauses.push(sql<boolean>`i.inspection_date <= ${filters.dateTo}`);
	}

	whereClauses.push(
		...regionMembershipClauses({
			geom: sql`i.geom`,
			geomType: sql`i.geom_type`,
			organizationId: sql`i.organization_id`,
			regionIds: filters?.regionIds,
		}),
	);

	return whereClauses;
}

export async function getInspectionMvtTile(
	db: Kysely<SimmerDatabase>,
	input: InspectionMvtTileInput,
): Promise<Uint8Array> {
	return inspectionSurface.getTile(db, input);
}

export async function listInspectionDisplayRowsByBounds(
	db: Kysely<SimmerDatabase>,
	input: InspectionBoundingBoxInput,
): Promise<InspectionDisplayPageResult> {
	return inspectionSurface.listByBounds(db, input);
}

export async function getInspectionDisplayRowById(
	db: Kysely<SimmerDatabase>,
	input: InspectionByIdInput,
): Promise<SafeInspectionDisplayRow | undefined> {
	return inspectionSurface.getById(db, input);
}

/**
 * Extent of every inspection matching the tile filters, ignoring the viewport —
 * what the explorer map frames on load and after a filter change.
 */
export async function getInspectionMapExtent(
	db: Kysely<SimmerDatabase>,
	input: MapFilterInput<InspectionMvtTileFilters>,
): Promise<MapExtent | null> {
	return inspectionSurface.getExtent(db, input);
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
	/** Match samples whose parent inspection falls inside any of these regions. */
	readonly regionIds?: readonly string[];
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

export type SampleBounds = MapBounds;
export type SampleMvtTileInput = MapTileInput<SampleListFilters>;
export type SampleBoundingBoxInput = MapBoundsPageInput<SampleListFilters>;
export type SampleByIdInput = MapByIdInput;

/** A page of sample display rows plus the full count for the viewport + filters. */
export type SampleDisplayPageResult = MapPageResult<SafeSampleDisplayRow>;

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

// The habitat name and the per-sample species roll-up, kept as one fragment so
// the bbox and by-id readers can never drift in shape.
const sampleDisplayJoins = sql`
	left join habitats h on h.id = i.habitat_id
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

// Geometry comes from the parent inspection; the roll-up columns come from the
// `agg` lateral above.
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

const sampleSurface = mapRecordSurface<SampleListFilters, SafeSampleDisplayRow>({
	layer: 'samples',
	from: sql`samples s join inspections i on i.id = s.inspection_id`,
	// Tenancy is the sample's; the geometry is its parent inspection's, which is
	// why the two aliases differ here and nowhere else.
	alias: 's',
	geom: sql`i.geom`,
	properties: [sql`s.id`, sql`(${sampleStatusExpression}) as "status"`],
	// A sample whose inspection was deleted, or whose inspection never carried
	// geometry, is not on the map at all.
	alwaysWhere: [sql<boolean>`i.deleted_at is null`, sql<boolean>`i.geom is not null`],
	filterWhere: sampleFilterWhere,
	display: {
		columns: sampleDisplayColumns,
		joins: sampleDisplayJoins,
		orderBy: sql`i.inspection_date desc, s.created_at desc, s.id`,
	},
});

function sampleFilterWhere(filters: SampleListFilters | undefined): RawBuilder<boolean>[] {
	if (filters === undefined) {
		return [];
	}

	const clauses: RawBuilder<boolean>[] = [];
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
	// A sample inherits the parent inspection's geometry, so region membership is
	// tested against that — the same geometry the tile and extent reads project.
	clauses.push(
		...regionMembershipClauses({
			geom: sql`i.geom`,
			geomType: sql`i.geom_type`,
			organizationId: sql`s.organization_id`,
			regionIds: filters.regionIds,
		}),
	);

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

export async function getSampleMvtTile(
	db: Kysely<SimmerDatabase>,
	input: SampleMvtTileInput,
): Promise<Uint8Array> {
	return sampleSurface.getTile(db, input);
}

export async function listSampleDisplayRowsByBounds(
	db: Kysely<SimmerDatabase>,
	input: SampleBoundingBoxInput,
): Promise<SampleDisplayPageResult> {
	return sampleSurface.listByBounds(db, input);
}

export async function getSampleDisplayRowById(
	db: Kysely<SimmerDatabase>,
	input: SampleByIdInput,
): Promise<SafeSampleDisplayRow | undefined> {
	return sampleSurface.getById(db, input);
}

/**
 * Extent of every sample matching the tile filters, ignoring the viewport. A
 * sample inherits its parent inspection's geometry, so the join mirrors the tile
 * read exactly.
 */
export async function getSampleMapExtent(
	db: Kysely<SimmerDatabase>,
	input: MapFilterInput<SampleListFilters>,
): Promise<MapExtent | null> {
	return sampleSurface.getExtent(db, input);
}
