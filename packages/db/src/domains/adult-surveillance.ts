import { type Kysely, type RawBuilder, sql, type Transaction } from 'kysely';

import type {
	CollectionTimingMode,
	GeoJsonGeometry,
	OwnedGeometryInfo,
	SimmerDatabase,
} from '../index.js';

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
