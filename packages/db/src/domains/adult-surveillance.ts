import { type Kysely, type RawBuilder, sql } from 'kysely';

import type {
	AdultCollectionTimingMode,
	DbExecutor,
	GeoJsonGeometry,
	OwnedGeometryInfo,
	SimmerDatabase,
} from '../index.js';
import type { MapExtent } from './map-extent.js';
import { regionMembershipClauses } from './map-region-filter.js';
import {
	type MapByIdInput,
	type MapFilterInput,
	type MapPageInput,
	type MapPageResult,
	type MapRecordSurfaceReaders,
	type MapTileInput,
	mapRecordSurface,
} from './map-surface.js';
import { geojsonToGeom } from './org-owned-writes.js';
import { assertIanaTimeZone, localDateSql } from './record-display-sql.js';
import { checkedValues } from './write-references.js';

export interface CreateTrapInput {
	readonly organizationId: string;
	readonly geojson: GeoJsonGeometry;
	readonly collectionMethodId: string;
	readonly addressId?: string | null;
	readonly collectionLureId?: string | null;
	readonly trapName?: string | null;
	readonly trapCode?: string | null;
	readonly description?: string | null;
	readonly isActive?: boolean;
	readonly createdByProfileId?: string | null;
	readonly updatedByProfileId?: string | null;
}

export interface SafeTrap {
	readonly id: string;
	readonly organizationId: string;
	readonly geometry: OwnedGeometryInfo;
	readonly collectionMethodId: string;
	readonly addressId: string | null;
	readonly collectionLureId: string | null;
	readonly trapName: string | null;
	readonly trapCode: string | null;
	readonly description: string | null;
	readonly isActive: boolean;
	readonly createdByProfileId: string | null;
	readonly updatedByProfileId: string | null;
	readonly createdAt: Date;
	readonly updatedAt: Date;
}

export interface CreateCollectionInput {
	readonly organizationId: string;
	readonly trapId?: string | null;
	readonly collectionMethodId?: string | null;
	readonly collectionLureId?: string | null;
	readonly geojson?: GeoJsonGeometry | null;
	readonly addressId?: string | null;
	readonly timingMode?: AdultCollectionTimingMode;
	readonly collectedAt?: Date | null;
	readonly collectedByProfileId?: string | null;
	readonly startedAt?: Date | null;
	readonly setByProfileId?: string | null;
	readonly collectionDate?: Date | null;
	readonly durationAmount?: number | null;
	readonly durationUnitId?: string | null;
	readonly hasProblem?: boolean;
	readonly isZeroResult?: boolean;
	readonly hasBycatch?: boolean;
	readonly metadata?: unknown | null;
	readonly createdByProfileId?: string | null;
	readonly updatedByProfileId?: string | null;
}

export interface SafeCollection {
	readonly id: string;
	readonly organizationId: string;
	readonly trapId: string | null;
	readonly collectionMethodId: string;
	readonly collectionLureId: string | null;
	readonly geometry: OwnedGeometryInfo;
	readonly addressId: string | null;
	readonly collectedAt: Date | null;
	readonly collectedByProfileId: string | null;
	readonly startedAt: Date | null;
	readonly setByProfileId: string | null;
	readonly timingMode: AdultCollectionTimingMode;
	readonly collectionDate: Date | null;
	readonly durationAmount: number | null;
	readonly durationUnitId: string | null;
	readonly hasProblem: boolean;
	readonly isZeroResult: boolean;
	readonly hasBycatch: boolean;
	readonly metadata: unknown | null;
	readonly createdByProfileId: string | null;
	readonly updatedByProfileId: string | null;
	readonly createdAt: Date;
	readonly updatedAt: Date;
}

const trapReturnColumns = [
	'id',
	'organization_id',
	'lat',
	'lng',
	'geojson',
	'geom_type',
	'collection_method_id',
	'address_id',
	'collection_lure_id',
	'trap_name',
	'trap_code',
	'description',
	'is_active',
	'created_by_profile_id',
	'updated_by_profile_id',
	'created_at',
	'updated_at',
] as const;

export async function createTrap(db: DbExecutor, input: CreateTrapInput): Promise<SafeTrap> {
	const row = await db
		.insertInto('traps')
		.values(
			await checkedValues(db, input.organizationId, {
				organization_id: input.organizationId,
				geom: geojsonToGeom(input.geojson),
				collection_method_id: input.collectionMethodId,
				address_id: input.addressId ?? null,
				collection_lure_id: input.collectionLureId ?? null,
				trap_name: input.trapName ?? null,
				trap_code: input.trapCode ?? null,
				description: input.description ?? null,
				is_active: input.isActive ?? true,
				created_by_profile_id: input.createdByProfileId ?? null,
				updated_by_profile_id: input.updatedByProfileId ?? input.createdByProfileId ?? null,
			}),
		)
		.returning(trapReturnColumns)
		.executeTakeFirstOrThrow();

	return toSafeTrap(row);
}

export async function listTraps(db: DbExecutor, organizationId: string): Promise<SafeTrap[]> {
	const rows = await db
		.selectFrom('traps')
		.select(trapReturnColumns)
		.where('organization_id', '=', organizationId)
		.where('deleted_at', 'is', null)
		.orderBy('trap_name', 'asc')
		.orderBy('trap_code', 'asc')
		.execute();

	return rows.map(toSafeTrap);
}

const collectionReturnColumns = [
	'id',
	'organization_id',
	'trap_id',
	'collection_method_id',
	'collection_lure_id',
	'lat',
	'lng',
	'geojson',
	'geom_type',
	'address_id',
	'collected_at',
	'collected_by_profile_id',
	'started_at',
	'set_by_profile_id',
	'collection_timing_mode',
	'collection_date',
	'duration_amount',
	'duration_unit_id',
	'has_problem',
	'is_zero_result',
	'has_bycatch',
	'metadata',
	'created_by_profile_id',
	'updated_by_profile_id',
	'created_at',
	'updated_at',
] as const;

export async function createCollection(
	db: DbExecutor,
	input: CreateCollectionInput,
): Promise<SafeCollection> {
	const snapshot = await resolveCollectionSnapshot(db, input);
	const timing = resolveCollectionTiming(input);
	const row = await db
		.insertInto('collections')
		.values(
			await checkedValues(db, input.organizationId, {
				organization_id: input.organizationId,
				trap_id: input.trapId ?? null,
				collection_method_id: snapshot.collectionMethodId,
				collection_lure_id: snapshot.collectionLureId,
				geom: snapshot.geom,
				address_id: snapshot.addressId,
				collected_at: timing.collectedAt,
				collected_by_profile_id: input.collectedByProfileId ?? null,
				started_at: timing.startedAt,
				set_by_profile_id: input.setByProfileId ?? null,
				collection_timing_mode: timing.timingMode,
				collection_date: timing.collectionDate,
				duration_amount: timing.durationAmount,
				duration_unit_id: timing.durationUnitId,
				has_problem: input.hasProblem ?? false,
				is_zero_result: input.isZeroResult ?? false,
				has_bycatch: input.hasBycatch ?? false,
				metadata: input.metadata ?? null,
				created_by_profile_id: input.createdByProfileId ?? null,
				updated_by_profile_id: input.updatedByProfileId ?? input.createdByProfileId ?? null,
			}),
		)
		.returning(collectionReturnColumns)
		.executeTakeFirstOrThrow();

	return toSafeCollection(row);
}

export async function listCollections(
	db: DbExecutor,
	organizationId: string,
): Promise<SafeCollection[]> {
	const rows = await db
		.selectFrom('collections')
		.select(collectionReturnColumns)
		.where('organization_id', '=', organizationId)
		.where('deleted_at', 'is', null)
		.orderBy('collected_at', 'desc')
		.orderBy('created_at', 'desc')
		.execute();

	return rows.map(toSafeCollection);
}

async function resolveCollectionSnapshot(
	db: DbExecutor,
	input: CreateCollectionInput,
): Promise<{
	readonly collectionMethodId: string;
	readonly collectionLureId: string | null;
	readonly geom: RawBuilder<string>;
	readonly addressId: string | null;
}> {
	if (input.trapId !== undefined && input.trapId !== null) {
		const trap = await db
			.selectFrom('traps')
			.select(['collection_method_id', 'collection_lure_id', 'address_id', 'geojson'])
			.where('id', '=', input.trapId)
			.where('organization_id', '=', input.organizationId)
			.where('deleted_at', 'is', null)
			.executeTakeFirst();

		if (trap === undefined) {
			throw new Error('Trap not found.');
		}

		return {
			collectionMethodId: trap.collection_method_id,
			collectionLureId: trap.collection_lure_id,
			geom: geojsonToGeom(trap.geojson),
			addressId: trap.address_id,
		};
	}

	if (input.collectionMethodId === undefined || input.collectionMethodId === null) {
		throw new Error('collectionMethodId is required for ad hoc collections.');
	}
	if (input.geojson === undefined || input.geojson === null) {
		throw new Error('geojson is required for ad hoc collections.');
	}

	return {
		collectionMethodId: input.collectionMethodId,
		collectionLureId: input.collectionLureId ?? null,
		geom: geojsonToGeom(input.geojson),
		addressId: input.addressId ?? null,
	};
}

function resolveCollectionTiming(input: CreateCollectionInput): {
	readonly timingMode: AdultCollectionTimingMode;
	readonly startedAt: Date | null;
	readonly collectedAt: Date | null;
	readonly collectionDate: Date | null;
	readonly durationAmount: number | null;
	readonly durationUnitId: string | null;
} {
	const timingMode =
		input.timingMode ??
		(input.collectionDate !== undefined ||
		input.durationAmount !== undefined ||
		input.durationUnitId !== undefined
			? 'collection_date_duration'
			: 'exact_timestamps');

	if (timingMode === 'collection_date_duration') {
		if (input.collectionDate === undefined || input.collectionDate === null) {
			throw new Error('collectionDate is required for collection date duration timing.');
		}
		if (
			input.durationAmount === undefined ||
			input.durationAmount === null ||
			input.durationAmount <= 0
		) {
			throw new Error(
				'durationAmount must be greater than zero for collection date duration timing.',
			);
		}
		if (input.durationUnitId === undefined || input.durationUnitId === null) {
			throw new Error('durationUnitId is required for collection date duration timing.');
		}

		return {
			timingMode,
			startedAt: null,
			collectedAt: null,
			collectionDate: input.collectionDate,
			durationAmount: input.durationAmount,
			durationUnitId: input.durationUnitId,
		};
	}

	if (input.startedAt === undefined || input.startedAt === null) {
		throw new Error('startedAt is required for exact timestamp collection timing.');
	}
	if (
		input.collectedAt !== undefined &&
		input.collectedAt !== null &&
		input.collectedAt < input.startedAt
	) {
		throw new Error('collectedAt must be greater than or equal to startedAt.');
	}

	return {
		timingMode,
		startedAt: input.startedAt,
		collectedAt: input.collectedAt ?? null,
		collectionDate: null,
		durationAmount: null,
		durationUnitId: null,
	};
}

function toOwnedGeometryInfo(row: {
	readonly lat: number;
	readonly lng: number;
	readonly geojson: GeoJsonGeometry;
	readonly geom_type: string;
}): OwnedGeometryInfo {
	return {
		lat: row.lat,
		lng: row.lng,
		geojson: row.geojson,
		geomType: row.geom_type,
	};
}

function toSafeTrap(row: {
	readonly id: string;
	readonly organization_id: string;
	readonly lat: number;
	readonly lng: number;
	readonly geojson: GeoJsonGeometry;
	readonly geom_type: string;
	readonly collection_method_id: string;
	readonly address_id: string | null;
	readonly collection_lure_id: string | null;
	readonly trap_name: string | null;
	readonly trap_code: string | null;
	readonly description: string | null;
	readonly is_active: boolean;
	readonly created_by_profile_id: string | null;
	readonly updated_by_profile_id: string | null;
	readonly created_at: Date;
	readonly updated_at: Date;
}): SafeTrap {
	return {
		id: row.id,
		organizationId: row.organization_id,
		geometry: toOwnedGeometryInfo(row),
		collectionMethodId: row.collection_method_id,
		addressId: row.address_id,
		collectionLureId: row.collection_lure_id,
		trapName: row.trap_name,
		trapCode: row.trap_code,
		description: row.description,
		isActive: row.is_active,
		createdByProfileId: row.created_by_profile_id,
		updatedByProfileId: row.updated_by_profile_id,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

function toSafeCollection(row: {
	readonly id: string;
	readonly organization_id: string;
	readonly trap_id: string | null;
	readonly collection_method_id: string;
	readonly collection_lure_id: string | null;
	readonly lat: number;
	readonly lng: number;
	readonly geojson: GeoJsonGeometry;
	readonly geom_type: string;
	readonly address_id: string | null;
	readonly collected_at: Date | null;
	readonly collected_by_profile_id: string | null;
	readonly started_at: Date | null;
	readonly set_by_profile_id: string | null;
	readonly collection_timing_mode: AdultCollectionTimingMode;
	readonly collection_date: Date | null;
	readonly duration_amount: number | null;
	readonly duration_unit_id: string | null;
	readonly has_problem: boolean;
	readonly is_zero_result: boolean;
	readonly has_bycatch: boolean;
	readonly metadata: unknown | null;
	readonly created_by_profile_id: string | null;
	readonly updated_by_profile_id: string | null;
	readonly created_at: Date;
	readonly updated_at: Date;
}): SafeCollection {
	return {
		id: row.id,
		organizationId: row.organization_id,
		trapId: row.trap_id,
		collectionMethodId: row.collection_method_id,
		collectionLureId: row.collection_lure_id,
		geometry: toOwnedGeometryInfo(row),
		addressId: row.address_id,
		collectedAt: row.collected_at,
		collectedByProfileId: row.collected_by_profile_id,
		startedAt: row.started_at,
		setByProfileId: row.set_by_profile_id,
		timingMode: row.collection_timing_mode,
		collectionDate: row.collection_date,
		durationAmount: row.duration_amount,
		durationUnitId: row.duration_unit_id,
		hasProblem: row.has_problem,
		isZeroResult: row.is_zero_result,
		hasBycatch: row.has_bycatch,
		metadata: row.metadata,
		createdByProfileId: row.created_by_profile_id,
		updatedByProfileId: row.updated_by_profile_id,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

// --- adult-surveillance map surfaces ----------------------------------------
//
// Mirrors the larval map trio (tile / paged list / by-id) for the traps and
// collections explorers: unbounded MVT tiles for the map, a filtered offset-paged
// list (no bbox) for the result rail. Both records carry their own owned point
// geometry. Trap/lure/method names resolve client-side from the eager catalog.

// --- traps ------------------------------------------------------------------

export interface TrapMapFilters {
	readonly collectionMethodIds?: readonly string[];
	/** Match traps by active state; omit for all. */
	readonly isActive?: boolean;
	/** Case-insensitive match on trap name, code, or description. */
	readonly search?: string;
	/** Match traps falling inside any of these regions. */
	readonly regionIds?: readonly string[];
}

export type TrapMvtTileInput = MapTileInput<TrapMapFilters>;
export type TrapPageInput = MapPageInput<TrapMapFilters>;
export type TrapByIdInput = MapByIdInput;

export interface SafeTrapDisplayRow {
	readonly id: string;
	readonly organizationId: string;
	readonly lat: number;
	readonly lng: number;
	readonly geojson: GeoJsonGeometry;
	readonly geomType: string;
	readonly collectionMethodId: string;
	readonly collectionLureId: string | null;
	readonly addressId: string | null;
	readonly trapName: string | null;
	readonly trapCode: string | null;
	readonly description: string | null;
	readonly isActive: boolean;
	readonly createdAt: Date;
	readonly updatedAt: Date;
}

export type TrapPageResult = MapPageResult<SafeTrapDisplayRow>;

const trapDisplayColumns = sql`
	t.id,
	t.organization_id as "organizationId",
	t.lat,
	t.lng,
	t.geojson,
	t.geom_type as "geomType",
	t.collection_method_id as "collectionMethodId",
	t.collection_lure_id as "collectionLureId",
	t.address_id as "addressId",
	t.trap_name as "trapName",
	t.trap_code as "trapCode",
	t.description,
	t.is_active as "isActive",
	t.created_at as "createdAt",
	t.updated_at as "updatedAt"
`;

const trapSurface = mapRecordSurface<TrapMapFilters, SafeTrapDisplayRow>({
	layer: 'traps',
	from: sql`traps t`,
	alias: 't',
	geom: sql`t.geom`,
	properties: [sql`t.id`, sql`t.is_active as "isActive"`],
	filterWhere: trapFilterWhere,
	display: {
		columns: trapDisplayColumns,
		// Sorted by what the client shows first ("code - name"), so the list reads
		// in the order it is drawn.
		orderBy: sql`coalesce(t.trap_code, t.trap_name) asc nulls last, t.created_at desc, t.id`,
	},
});

function trapFilterWhere(filters: TrapMapFilters | undefined): RawBuilder<boolean>[] {
	const clauses: RawBuilder<boolean>[] = [];
	if (filters?.collectionMethodIds !== undefined && filters.collectionMethodIds.length > 0) {
		clauses.push(
			sql<boolean>`t.collection_method_id = any(${[...filters.collectionMethodIds]}::uuid[])`,
		);
	}
	if (filters?.isActive !== undefined) {
		clauses.push(sql<boolean>`t.is_active = ${filters.isActive}`);
	}
	const search = filters?.search?.trim();
	if (search !== undefined && search.length > 0) {
		const pattern = `%${search}%`;
		clauses.push(
			sql<boolean>`(
				t.trap_name ilike ${pattern}
				or t.trap_code ilike ${pattern}
				or t.description ilike ${pattern}
			)`,
		);
	}
	clauses.push(
		...regionMembershipClauses({
			geom: sql`t.geom`,
			geomType: sql`t.geom_type`,
			organizationId: sql`t.organization_id`,
			regionIds: filters?.regionIds,
		}),
	);
	return clauses;
}

export async function getTrapMvtTile(
	db: Kysely<SimmerDatabase>,
	input: TrapMvtTileInput,
): Promise<Uint8Array> {
	return trapSurface.getTile(db, input);
}

export async function listTrapDisplayRowsPage(
	db: Kysely<SimmerDatabase>,
	input: TrapPageInput,
): Promise<TrapPageResult> {
	return trapSurface.listPage(db, input);
}

export async function getTrapDisplayRowById(
	db: Kysely<SimmerDatabase>,
	input: TrapByIdInput,
): Promise<SafeTrapDisplayRow | undefined> {
	return trapSurface.getById(db, input);
}

/**
 * Extent of every trap matching the map filters, ignoring the viewport — what
 * the explorer map frames on load and after a filter change.
 */
export async function getTrapMapExtent(
	db: Kysely<SimmerDatabase>,
	input: MapFilterInput<TrapMapFilters>,
): Promise<MapExtent | null> {
	return trapSurface.getExtent(db, input);
}

// --- collections ------------------------------------------------------------

export interface CollectionMapFilters {
	readonly collectionMethodIds?: readonly string[];
	/** Only collections flagged with a problem. */
	readonly problemOnly?: boolean;
	/** Match collections falling inside any of these regions. */
	readonly regionIds?: readonly string[];
	/** Inclusive lower bound on the collection's effective date (`YYYY-MM-DD`). */
	readonly dateFrom?: string;
	/** Inclusive upper bound on the collection's effective date (`YYYY-MM-DD`). */
	readonly dateTo?: string;
}

/**
 * Every collection read carries the agency's timezone, because every one of them
 * has to decide which calendar day a `collected_at` instant fell on. It is not a
 * filter — the operator never chooses it — so it rides on the input beside the
 * filters rather than inside them.
 */
export interface CollectionTimeZoneInput {
	/** The agency's IANA timezone, from `AuthContext`. */
	readonly timeZone: string;
}

export type CollectionMvtTileInput = MapTileInput<CollectionMapFilters> & CollectionTimeZoneInput;
export type CollectionPageInput = MapPageInput<CollectionMapFilters> & CollectionTimeZoneInput;
export type CollectionExtentInput = MapFilterInput<CollectionMapFilters> & CollectionTimeZoneInput;
export type CollectionByIdInput = MapByIdInput;

export interface SafeCollectionDisplayRow {
	readonly id: string;
	readonly organizationId: string;
	readonly trapId: string | null;
	readonly lat: number;
	readonly lng: number;
	readonly geojson: GeoJsonGeometry;
	readonly geomType: string;
	readonly collectionMethodId: string;
	readonly collectedAt: string | null;
	readonly collectionDate: string | null;
	readonly collectionTimingMode: AdultCollectionTimingMode;
	readonly hasProblem: boolean;
	readonly isZeroResult: boolean;
	readonly hasBycatch: boolean;
	/** Resolved by precedence; see {@link CollectionStatus}. */
	readonly status: CollectionStatus;
	readonly createdAt: Date;
	readonly updatedAt: Date;
}

export type CollectionPageResult = MapPageResult<SafeCollectionDisplayRow>;

/**
 * The zone the by-id read is built with.
 *
 * That read projects raw columns and neither filters nor orders by the effective
 * date, so no zone-dependent decision is made — UTC keeps it out of the cache's
 * way rather than standing for any agency's clock.
 */
const DEFAULT_SURFACE_TIME_ZONE = 'UTC';

/**
 * The single date a collection is filtered and ordered by, in the agency's zone.
 *
 * The two timing modes store it in different columns — an exact timestamp in
 * `collected_at`, a plain date in `collection_date` (with `collected_at` null) —
 * so they coalesce to one effective date.
 *
 * The timestamp half must be converted before it is reduced to a day. A bare
 * `collected_at::date` uses the *database server's* session timezone, so a trap
 * emptied at 9pm in a US agency files under the next day and drops out of the
 * range the operator actually asked for. `at time zone` with an IANA name
 * applies the offset in force at that instant, so this stays right across a
 * daylight-saving change rather than an hour off for half the season.
 */
function collectionEffectiveDateExpr(timeZone: string): RawBuilder<unknown> {
	return sql.raw(
		`coalesce(${localDateSql('c.collected_at', assertIanaTimeZone(timeZone))}, c.collection_date)`,
	);
}

/**
 * The four states a collection can be in, resolved server-side by precedence so
 * the map colour and the result rail can never disagree about what one is.
 *
 * `pending` first, because it says the record is not finished: the trap is still
 * out and there is nothing to report a problem or a count about yet. It reads
 * the row's own `collection_timing_mode` rather than the agency's current
 * setting, because a null `collected_at` means "not emptied" only under exact
 * timestamps. Under date-plus-duration every finished collection has one, and a
 * status keyed off the column alone would paint the whole surface pending.
 */
export type CollectionStatus = 'pending' | 'problem' | 'zero_result' | 'collected';

export const collectionStatusValues: readonly CollectionStatus[] = [
	'pending',
	'problem',
	'zero_result',
	'collected',
];

const collectionStatusExpression = sql`
	case
		when c.collection_timing_mode = 'exact_timestamps' and c.collected_at is null then 'pending'
		when c.has_problem then 'problem'
		when c.is_zero_result then 'zero_result'
		else 'collected'
	end
`;

const collectionDisplayColumns = sql`
	c.id,
	c.organization_id as "organizationId",
	c.trap_id as "trapId",
	c.lat,
	c.lng,
	c.geojson,
	c.geom_type as "geomType",
	c.collection_method_id as "collectionMethodId",
	c.collected_at::text as "collectedAt",
	c.collection_date::text as "collectionDate",
	c.collection_timing_mode as "collectionTimingMode",
	c.has_problem as "hasProblem",
	c.is_zero_result as "isZeroResult",
	c.has_bycatch as "hasBycatch",
	(${collectionStatusExpression}) as "status",
	c.set_by_profile_id as "setByProfileId",
	c.collected_by_profile_id as "collectedByProfileId",
	c.created_at as "createdAt",
	c.updated_at as "updatedAt"
`;

/**
 * The collections surface, built for one agency's timezone.
 *
 * Parameterized rather than declared once because the zone reaches into both
 * halves of the surface: the predicates that decide which collections fall in
 * the window, and the order the result rail reads in. Built separately they
 * could disagree — a list ordered by one notion of "the day" and filtered by
 * another — so both come from {@link collectionEffectiveDateExpr}.
 *
 * Cached per zone: an agency has one, so this holds a handful of entries for the
 * life of the process rather than rebuilding the definition per request.
 */
const collectionSurfaces = new Map<
	string,
	MapRecordSurfaceReaders<CollectionMapFilters, SafeCollectionDisplayRow>
>();

function collectionSurface(
	timeZone: string,
): MapRecordSurfaceReaders<CollectionMapFilters, SafeCollectionDisplayRow> {
	const zone = assertIanaTimeZone(timeZone);
	const cached = collectionSurfaces.get(zone);
	if (cached !== undefined) {
		return cached;
	}
	const effectiveDate = collectionEffectiveDateExpr(zone);
	const surface = mapRecordSurface<CollectionMapFilters, SafeCollectionDisplayRow>({
		layer: 'collections',
		from: sql`collections c`,
		alias: 'c',
		geom: sql`c.geom`,
		properties: [sql`c.id`, sql`(${collectionStatusExpression}) as "status"`],
		filterWhere: (filters) => collectionFilterWhere(filters, effectiveDate),
		display: {
			columns: collectionDisplayColumns,
			orderBy: sql`${effectiveDate} desc nulls last, c.created_at desc, c.id`,
		},
	});
	collectionSurfaces.set(zone, surface);
	return surface;
}

function collectionFilterWhere(
	filters: CollectionMapFilters | undefined,
	effectiveDate: RawBuilder<unknown>,
): RawBuilder<boolean>[] {
	const clauses: RawBuilder<boolean>[] = [];
	if (filters?.collectionMethodIds !== undefined && filters.collectionMethodIds.length > 0) {
		clauses.push(
			sql<boolean>`c.collection_method_id = any(${[...filters.collectionMethodIds]}::uuid[])`,
		);
	}
	if (filters?.problemOnly === true) {
		clauses.push(sql<boolean>`c.has_problem = true`);
	}
	if (filters?.dateFrom !== undefined) {
		clauses.push(sql<boolean>`${effectiveDate} >= ${filters.dateFrom}`);
	}
	if (filters?.dateTo !== undefined) {
		clauses.push(sql<boolean>`${effectiveDate} <= ${filters.dateTo}`);
	}
	clauses.push(
		...regionMembershipClauses({
			geom: sql`c.geom`,
			geomType: sql`c.geom_type`,
			organizationId: sql`c.organization_id`,
			regionIds: filters?.regionIds,
		}),
	);
	return clauses;
}

export async function getCollectionMvtTile(
	db: Kysely<SimmerDatabase>,
	input: CollectionMvtTileInput,
): Promise<Uint8Array> {
	return collectionSurface(input.timeZone).getTile(db, input);
}

export async function listCollectionDisplayRowsPage(
	db: Kysely<SimmerDatabase>,
	input: CollectionPageInput,
): Promise<CollectionPageResult> {
	return collectionSurface(input.timeZone).listPage(db, input);
}

export async function getCollectionDisplayRowById(
	db: Kysely<SimmerDatabase>,
	input: CollectionByIdInput,
): Promise<SafeCollectionDisplayRow | undefined> {
	// No zone needed: this projects raw columns and neither filters nor orders by
	// the effective date, so which day the instant falls on never comes up.
	return collectionSurface(DEFAULT_SURFACE_TIME_ZONE).getById(db, input);
}

/**
 * Extent of every collection matching the map filters, ignoring the viewport —
 * what the explorer map frames on load and after a filter change.
 */
export async function getCollectionMapExtent(
	db: Kysely<SimmerDatabase>,
	input: CollectionExtentInput,
): Promise<MapExtent | null> {
	return collectionSurface(input.timeZone).getExtent(db, input);
}
