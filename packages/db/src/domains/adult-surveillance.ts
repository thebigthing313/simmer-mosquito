import { type Kysely, type RawBuilder, sql, type Transaction } from 'kysely';

import type {
	CollectionTimingMode,
	GeoJsonGeometry,
	OwnedGeometryInfo,
	SimmerDatabase,
} from '../index.js';
import { type MapExtent, readMapExtent } from './map-extent.js';

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
	readonly timingMode?: CollectionTimingMode;
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
	readonly timingMode: CollectionTimingMode;
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

type DbExecutor = Kysely<SimmerDatabase> | Transaction<SimmerDatabase>;

function geojsonToGeom(geojson: GeoJsonGeometry): RawBuilder<string> {
	const serialized = JSON.stringify(geojson);
	return sql<string>`st_force2d(st_setsrid(st_geomfromgeojson(
		case
			when (${serialized}::jsonb -> 'geometry') is not null
				then (${serialized}::jsonb -> 'geometry')::text
			else ${serialized}
		end
	), 4326))`;
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
		.values({
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
		})
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
		.values({
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
		})
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
	readonly timingMode: CollectionTimingMode;
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
	readonly collection_timing_mode: CollectionTimingMode;
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

const mapMvtExtent = 4096;
const mapMvtBuffer = 64;

function mapTileEnvelopeCte(input: { readonly z: number; readonly x: number; readonly y: number }) {
	return sql`
		bounds as (
			select
				st_tileenvelope(${input.z}, ${input.x}, ${input.y}) as geom_3857,
				st_transform(st_tileenvelope(${input.z}, ${input.x}, ${input.y}), 4326) as geom_4326
		)
	`;
}

// --- traps ------------------------------------------------------------------

export interface TrapMapFilters {
	readonly collectionMethodIds?: readonly string[];
	/** Match traps by active state; omit for all. */
	readonly isActive?: boolean;
	/** Case-insensitive match on trap name, code, or description. */
	readonly search?: string;
}

export interface TrapMvtTileInput {
	readonly z: number;
	readonly x: number;
	readonly y: number;
	readonly organizationId: string;
	readonly filters?: TrapMapFilters;
}

export interface TrapPageInput {
	readonly organizationId: string;
	readonly filters?: TrapMapFilters;
	readonly limit: number;
	readonly offset: number;
}

export interface TrapByIdInput {
	readonly organizationId: string;
	readonly id: string;
}

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

export interface TrapPageResult {
	readonly total: number;
	readonly rows: SafeTrapDisplayRow[];
}

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
	return clauses;
}

export async function getTrapMvtTile(
	db: Kysely<SimmerDatabase>,
	input: TrapMvtTileInput,
): Promise<Uint8Array> {
	const whereClauses: RawBuilder<boolean>[] = [
		sql<boolean>`t.organization_id = ${input.organizationId}`,
		sql<boolean>`t.deleted_at is null`,
		sql<boolean>`t.geom && bounds.geom_4326`,
		sql<boolean>`st_intersects(t.geom, bounds.geom_4326)`,
		...trapFilterWhere(input.filters),
	];

	const result = await sql<{ readonly tile: Uint8Array | null }>`
		with
		${mapTileEnvelopeCte(input)},
		tile_rows as (
			select
				t.id,
				t.is_active as "isActive",
				st_asmvtgeom(
					st_transform(t.geom, 3857),
					bounds.geom_3857,
					extent => ${mapMvtExtent},
					buffer => ${mapMvtBuffer}
				) as geom
			from traps t
			cross join bounds
			where ${sql.join(whereClauses, sql` and `)}
		)
		select coalesce(st_asmvt(tile_rows, 'traps', ${mapMvtExtent}, 'geom'), ''::bytea) as tile
		from tile_rows
	`.execute(db);

	return result.rows[0]?.tile ?? new Uint8Array();
}

export async function listTrapDisplayRowsPage(
	db: Kysely<SimmerDatabase>,
	input: TrapPageInput,
): Promise<TrapPageResult> {
	const whereClauses: RawBuilder<boolean>[] = [
		sql<boolean>`t.organization_id = ${input.organizationId}`,
		sql<boolean>`t.deleted_at is null`,
		...trapFilterWhere(input.filters),
	];

	const result = await sql<SafeTrapDisplayRow & { readonly total: number }>`
		select
			${trapDisplayColumns},
			count(*) over()::int as "total"
		from traps t
		where ${sql.join(whereClauses, sql` and `)}
		-- Sort by what the client shows first ("code - name"), so the list reads in order.
		order by coalesce(t.trap_code, t.trap_name) asc nulls last, t.created_at desc, t.id
		limit ${input.limit}
		offset ${input.offset}
	`.execute(db);

	return {
		total: result.rows[0]?.total ?? 0,
		rows: result.rows,
	};
}

export async function getTrapDisplayRowById(
	db: Kysely<SimmerDatabase>,
	input: TrapByIdInput,
): Promise<SafeTrapDisplayRow | undefined> {
	const result = await sql<SafeTrapDisplayRow>`
		select ${trapDisplayColumns}
		from traps t
		where t.id = ${input.id}
			and t.organization_id = ${input.organizationId}
			and t.deleted_at is null
		limit 1
	`.execute(db);

	return result.rows[0];
}

/**
 * Extent of every trap matching the map filters, ignoring the viewport — what
 * the explorer map frames on load and after a filter change.
 */
export async function getTrapMapExtent(
	db: Kysely<SimmerDatabase>,
	input: { readonly organizationId: string; readonly filters?: TrapMapFilters },
): Promise<MapExtent | null> {
	return readMapExtent(db, {
		geom: sql`t.geom`,
		from: sql`traps t`,
		where: [
			sql<boolean>`t.organization_id = ${input.organizationId}`,
			sql<boolean>`t.deleted_at is null`,
			...trapFilterWhere(input.filters),
		],
	});
}

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

// --- collections ------------------------------------------------------------

export interface CollectionMapFilters {
	readonly collectionMethodIds?: readonly string[];
	/** Only collections flagged with a problem. */
	readonly problemOnly?: boolean;
	/** Inclusive lower bound on the collection's effective date (`YYYY-MM-DD`). */
	readonly dateFrom?: string;
	/** Inclusive upper bound on the collection's effective date (`YYYY-MM-DD`). */
	readonly dateTo?: string;
}

export interface CollectionMvtTileInput {
	readonly z: number;
	readonly x: number;
	readonly y: number;
	readonly organizationId: string;
	readonly filters?: CollectionMapFilters;
}

export interface CollectionPageInput {
	readonly organizationId: string;
	readonly filters?: CollectionMapFilters;
	readonly limit: number;
	readonly offset: number;
}

export interface CollectionByIdInput {
	readonly organizationId: string;
	readonly id: string;
}

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
	readonly hasProblem: boolean;
	readonly isZeroResult: boolean;
	readonly hasBycatch: boolean;
	readonly createdAt: Date;
	readonly updatedAt: Date;
}

export interface CollectionPageResult {
	readonly total: number;
	readonly rows: SafeCollectionDisplayRow[];
}

// The two timing modes store the date in different columns — an exact timestamp
// in `collected_at`, a plain date in `collection_date` (with `collected_at`
// null). Coalesce to a single effective date for filtering and ordering.
const collectionEffectiveDateExpr = sql`coalesce(c.collected_at::date, c.collection_date)`;

function collectionFilterWhere(filters: CollectionMapFilters | undefined): RawBuilder<boolean>[] {
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
		clauses.push(sql<boolean>`${collectionEffectiveDateExpr} >= ${filters.dateFrom}`);
	}
	if (filters?.dateTo !== undefined) {
		clauses.push(sql<boolean>`${collectionEffectiveDateExpr} <= ${filters.dateTo}`);
	}
	return clauses;
}

export async function getCollectionMvtTile(
	db: Kysely<SimmerDatabase>,
	input: CollectionMvtTileInput,
): Promise<Uint8Array> {
	const whereClauses: RawBuilder<boolean>[] = [
		sql<boolean>`c.organization_id = ${input.organizationId}`,
		sql<boolean>`c.deleted_at is null`,
		sql<boolean>`c.geom && bounds.geom_4326`,
		sql<boolean>`st_intersects(c.geom, bounds.geom_4326)`,
		...collectionFilterWhere(input.filters),
	];

	const result = await sql<{ readonly tile: Uint8Array | null }>`
		with
		${mapTileEnvelopeCte(input)},
		tile_rows as (
			select
				c.id,
				c.has_problem as "hasProblem",
				st_asmvtgeom(
					st_transform(c.geom, 3857),
					bounds.geom_3857,
					extent => ${mapMvtExtent},
					buffer => ${mapMvtBuffer}
				) as geom
			from collections c
			cross join bounds
			where ${sql.join(whereClauses, sql` and `)}
		)
		select coalesce(st_asmvt(tile_rows, 'collections', ${mapMvtExtent}, 'geom'), ''::bytea) as tile
		from tile_rows
	`.execute(db);

	return result.rows[0]?.tile ?? new Uint8Array();
}

export async function listCollectionDisplayRowsPage(
	db: Kysely<SimmerDatabase>,
	input: CollectionPageInput,
): Promise<CollectionPageResult> {
	const whereClauses: RawBuilder<boolean>[] = [
		sql<boolean>`c.organization_id = ${input.organizationId}`,
		sql<boolean>`c.deleted_at is null`,
		...collectionFilterWhere(input.filters),
	];

	const result = await sql<SafeCollectionDisplayRow & { readonly total: number }>`
		select
			${collectionDisplayColumns},
			count(*) over()::int as "total"
		from collections c
		where ${sql.join(whereClauses, sql` and `)}
		order by ${collectionEffectiveDateExpr} desc nulls last, c.created_at desc, c.id
		limit ${input.limit}
		offset ${input.offset}
	`.execute(db);

	return {
		total: result.rows[0]?.total ?? 0,
		rows: result.rows,
	};
}

export async function getCollectionDisplayRowById(
	db: Kysely<SimmerDatabase>,
	input: CollectionByIdInput,
): Promise<SafeCollectionDisplayRow | undefined> {
	const result = await sql<SafeCollectionDisplayRow>`
		select ${collectionDisplayColumns}
		from collections c
		where c.id = ${input.id}
			and c.organization_id = ${input.organizationId}
			and c.deleted_at is null
		limit 1
	`.execute(db);

	return result.rows[0];
}

/**
 * Extent of every collection matching the map filters, ignoring the viewport —
 * what the explorer map frames on load and after a filter change.
 */
export async function getCollectionMapExtent(
	db: Kysely<SimmerDatabase>,
	input: { readonly organizationId: string; readonly filters?: CollectionMapFilters },
): Promise<MapExtent | null> {
	return readMapExtent(db, {
		geom: sql`c.geom`,
		from: sql`collections c`,
		where: [
			sql<boolean>`c.organization_id = ${input.organizationId}`,
			sql<boolean>`c.deleted_at is null`,
			...collectionFilterWhere(input.filters),
		],
	});
}

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
	c.has_problem as "hasProblem",
	c.is_zero_result as "isZeroResult",
	c.has_bycatch as "hasBycatch",
	c.set_by_profile_id as "setByProfileId",
	c.collected_by_profile_id as "collectedByProfileId",
	c.created_at as "createdAt",
	c.updated_at as "updatedAt"
`;
