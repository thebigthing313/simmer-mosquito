import { type Kysely, type RawBuilder, sql, type Transaction } from 'kysely';

import type { GeoJsonGeometry, OwnedGeometryInfo, SimmerDatabase } from '../index.js';

export interface CreateAddressInput {
	readonly id?: string;
	readonly organizationId: string;
	readonly geojson: GeoJsonGeometry;
	readonly displayName: string;
	readonly country: string;
	readonly addressLine1?: string | null;
	readonly addressLine2?: string | null;
	readonly locality?: string | null;
	readonly region?: string | null;
	readonly postalCode?: string | null;
	readonly geocoderResponse?: unknown | null;
	readonly createdByProfileId?: string | null;
	readonly updatedByProfileId?: string | null;
}

export interface SafeAddress {
	readonly id: string;
	readonly organizationId: string;
	readonly geometry: OwnedGeometryInfo;
	readonly displayName: string;
	readonly country: string;
	readonly addressLine1: string | null;
	readonly addressLine2: string | null;
	readonly locality: string | null;
	readonly region: string | null;
	readonly postalCode: string | null;
	readonly createdByProfileId: string | null;
	readonly updatedByProfileId: string | null;
	readonly createdAt: Date;
	readonly updatedAt: Date;
}

export interface CreateRegionFolderInput {
	readonly organizationId: string;
	readonly name: string;
	readonly description?: string | null;
	readonly createdByProfileId?: string | null;
	readonly updatedByProfileId?: string | null;
}

export interface SafeRegionFolder {
	readonly id: string;
	readonly organizationId: string;
	readonly name: string;
	readonly description: string | null;
	readonly createdByProfileId: string | null;
	readonly updatedByProfileId: string | null;
	readonly createdAt: Date;
	readonly updatedAt: Date;
}

export interface CreateRegionInput {
	readonly organizationId: string;
	readonly geojson: GeoJsonGeometry;
	readonly name: string;
	readonly regionFolderId?: string | null;
	readonly description?: string | null;
	readonly metadata?: unknown | null;
	readonly createdByProfileId?: string | null;
	readonly updatedByProfileId?: string | null;
}

export interface SafeRegion {
	readonly id: string;
	readonly organizationId: string;
	readonly regionFolderId: string | null;
	readonly geometry: OwnedGeometryInfo;
	readonly name: string;
	readonly description: string | null;
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

export async function createAddress(
	db: DbExecutor,
	input: CreateAddressInput,
): Promise<SafeAddress> {
	const row = await db
		.insertInto('addresses')
		.values({
			...(input.id === undefined ? {} : { id: input.id }),
			organization_id: input.organizationId,
			geom: geojsonToGeom(input.geojson),
			display_name: input.displayName,
			country: input.country,
			address_line_1: input.addressLine1 ?? null,
			address_line_2: input.addressLine2 ?? null,
			locality: input.locality ?? null,
			region: input.region ?? null,
			postal_code: input.postalCode ?? null,
			geocoder_response: input.geocoderResponse ?? null,
			created_by_profile_id: input.createdByProfileId ?? null,
			updated_by_profile_id: input.updatedByProfileId ?? input.createdByProfileId ?? null,
		})
		.returning([
			'id',
			'organization_id',
			'lat',
			'lng',
			'geojson',
			'geom_type',
			'display_name',
			'country',
			'address_line_1',
			'address_line_2',
			'locality',
			'region',
			'postal_code',
			'created_by_profile_id',
			'updated_by_profile_id',
			'created_at',
			'updated_at',
		])
		.executeTakeFirstOrThrow();

	return toSafeAddress(row);
}

export async function listAddresses(
	db: DbExecutor,
	organizationId: string,
): Promise<SafeAddress[]> {
	const rows = await db
		.selectFrom('addresses')
		.select([
			'id',
			'organization_id',
			'lat',
			'lng',
			'geojson',
			'geom_type',
			'display_name',
			'country',
			'address_line_1',
			'address_line_2',
			'locality',
			'region',
			'postal_code',
			'created_by_profile_id',
			'updated_by_profile_id',
			'created_at',
			'updated_at',
		])
		.where('organization_id', '=', organizationId)
		.where('deleted_at', 'is', null)
		.orderBy('display_name', 'asc')
		.execute();

	return rows.map(toSafeAddress);
}

export async function createRegionFolder(
	db: DbExecutor,
	input: CreateRegionFolderInput,
): Promise<SafeRegionFolder> {
	const row = await db
		.insertInto('region_folders')
		.values({
			organization_id: input.organizationId,
			name: input.name,
			description: input.description ?? null,
			created_by_profile_id: input.createdByProfileId ?? null,
			updated_by_profile_id: input.updatedByProfileId ?? input.createdByProfileId ?? null,
		})
		.returning([
			'id',
			'organization_id',
			'name',
			'description',
			'created_by_profile_id',
			'updated_by_profile_id',
			'created_at',
			'updated_at',
		])
		.executeTakeFirstOrThrow();

	return toSafeRegionFolder(row);
}

export async function listRegionFolders(
	db: DbExecutor,
	organizationId: string,
): Promise<SafeRegionFolder[]> {
	const rows = await db
		.selectFrom('region_folders')
		.select([
			'id',
			'organization_id',
			'name',
			'description',
			'created_by_profile_id',
			'updated_by_profile_id',
			'created_at',
			'updated_at',
		])
		.where('organization_id', '=', organizationId)
		.where('deleted_at', 'is', null)
		.orderBy('name', 'asc')
		.execute();

	return rows.map(toSafeRegionFolder);
}

export async function createRegion(db: DbExecutor, input: CreateRegionInput): Promise<SafeRegion> {
	const row = await db
		.insertInto('regions')
		.values({
			organization_id: input.organizationId,
			region_folder_id: input.regionFolderId ?? null,
			geom: geojsonToGeom(input.geojson),
			name: input.name,
			description: input.description ?? null,
			metadata: input.metadata ?? null,
			created_by_profile_id: input.createdByProfileId ?? null,
			updated_by_profile_id: input.updatedByProfileId ?? input.createdByProfileId ?? null,
		})
		.returning([
			'id',
			'organization_id',
			'region_folder_id',
			'lat',
			'lng',
			'geojson',
			'geom_type',
			'name',
			'description',
			'metadata',
			'created_by_profile_id',
			'updated_by_profile_id',
			'created_at',
			'updated_at',
		])
		.executeTakeFirstOrThrow();

	return toSafeRegion(row);
}

export async function listRegions(db: DbExecutor, organizationId: string): Promise<SafeRegion[]> {
	const rows = await db
		.selectFrom('regions')
		.select([
			'id',
			'organization_id',
			'region_folder_id',
			'lat',
			'lng',
			'geojson',
			'geom_type',
			'name',
			'description',
			'metadata',
			'created_by_profile_id',
			'updated_by_profile_id',
			'created_at',
			'updated_at',
		])
		.where('organization_id', '=', organizationId)
		.where('deleted_at', 'is', null)
		.orderBy('name', 'asc')
		.execute();

	return rows.map(toSafeRegion);
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

function toSafeAddress(row: {
	readonly id: string;
	readonly organization_id: string;
	readonly lat: number;
	readonly lng: number;
	readonly geojson: GeoJsonGeometry;
	readonly geom_type: string;
	readonly display_name: string;
	readonly country: string;
	readonly address_line_1: string | null;
	readonly address_line_2: string | null;
	readonly locality: string | null;
	readonly region: string | null;
	readonly postal_code: string | null;
	readonly created_by_profile_id: string | null;
	readonly updated_by_profile_id: string | null;
	readonly created_at: Date;
	readonly updated_at: Date;
}): SafeAddress {
	return {
		id: row.id,
		organizationId: row.organization_id,
		geometry: toOwnedGeometryInfo(row),
		displayName: row.display_name,
		country: row.country,
		addressLine1: row.address_line_1,
		addressLine2: row.address_line_2,
		locality: row.locality,
		region: row.region,
		postalCode: row.postal_code,
		createdByProfileId: row.created_by_profile_id,
		updatedByProfileId: row.updated_by_profile_id,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

function toSafeRegionFolder(row: {
	readonly id: string;
	readonly organization_id: string;
	readonly name: string;
	readonly description: string | null;
	readonly created_by_profile_id: string | null;
	readonly updated_by_profile_id: string | null;
	readonly created_at: Date;
	readonly updated_at: Date;
}): SafeRegionFolder {
	return {
		id: row.id,
		organizationId: row.organization_id,
		name: row.name,
		description: row.description,
		createdByProfileId: row.created_by_profile_id,
		updatedByProfileId: row.updated_by_profile_id,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

function toSafeRegion(row: {
	readonly id: string;
	readonly organization_id: string;
	readonly region_folder_id: string | null;
	readonly lat: number;
	readonly lng: number;
	readonly geojson: GeoJsonGeometry;
	readonly geom_type: string;
	readonly name: string;
	readonly description: string | null;
	readonly metadata: unknown | null;
	readonly created_by_profile_id: string | null;
	readonly updated_by_profile_id: string | null;
	readonly created_at: Date;
	readonly updated_at: Date;
}): SafeRegion {
	return {
		id: row.id,
		organizationId: row.organization_id,
		regionFolderId: row.region_folder_id,
		geometry: toOwnedGeometryInfo(row),
		name: row.name,
		description: row.description,
		metadata: row.metadata,
		createdByProfileId: row.created_by_profile_id,
		updatedByProfileId: row.updated_by_profile_id,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}
