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

const addressColumns = [
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
] as const;

export async function getAddressById(
	db: DbExecutor,
	input: { readonly id: string; readonly organizationId: string },
): Promise<SafeAddress | undefined> {
	const row = await db
		.selectFrom('addresses')
		.select(addressColumns)
		.where('id', '=', input.id)
		.where('organization_id', '=', input.organizationId)
		.where('deleted_at', 'is', null)
		.executeTakeFirst();

	return row === undefined ? undefined : toSafeAddress(row);
}

export interface UpdateAddressDetailsInput {
	readonly organizationId: string;
	readonly updatedByProfileId?: string | null;
	readonly displayName?: string;
	readonly addressLine1?: string | null;
	readonly addressLine2?: string | null;
	readonly locality?: string | null;
	readonly region?: string | null;
	readonly postalCode?: string | null;
	readonly geocoderResponse?: unknown | null;
}

export async function updateAddressDetails(
	db: DbExecutor,
	id: string,
	input: UpdateAddressDetailsInput,
): Promise<SafeAddress | null> {
	const row = await db
		.updateTable('addresses')
		.set({
			...('displayName' in input ? { display_name: input.displayName } : {}),
			...('addressLine1' in input ? { address_line_1: input.addressLine1 ?? null } : {}),
			...('addressLine2' in input ? { address_line_2: input.addressLine2 ?? null } : {}),
			...('locality' in input ? { locality: input.locality ?? null } : {}),
			...('region' in input ? { region: input.region ?? null } : {}),
			...('postalCode' in input ? { postal_code: input.postalCode ?? null } : {}),
			...('geocoderResponse' in input ? { geocoder_response: input.geocoderResponse ?? null } : {}),
			updated_by_profile_id: input.updatedByProfileId ?? null,
			updated_at: sql`now()`,
		})
		.where('id', '=', id)
		.where('organization_id', '=', input.organizationId)
		.where('deleted_at', 'is', null)
		.returning(addressColumns)
		.executeTakeFirst();

	return row === undefined ? null : toSafeAddress(row);
}

export async function updateAddressLocation(
	db: DbExecutor,
	id: string,
	input: {
		readonly organizationId: string;
		readonly geojson: GeoJsonGeometry;
		readonly updatedByProfileId?: string | null;
	},
): Promise<SafeAddress | null> {
	const row = await db
		.updateTable('addresses')
		.set({
			geom: geojsonToGeom(input.geojson),
			updated_by_profile_id: input.updatedByProfileId ?? null,
			updated_at: sql`now()`,
		})
		.where('id', '=', id)
		.where('organization_id', '=', input.organizationId)
		.where('deleted_at', 'is', null)
		.returning(addressColumns)
		.executeTakeFirst();

	return row === undefined ? null : toSafeAddress(row);
}

export async function deleteAddress(
	db: DbExecutor,
	id: string,
	input: { readonly organizationId: string; readonly actorProfileId?: string | null },
): Promise<SafeAddress | null> {
	const row = await db
		.updateTable('addresses')
		.set({
			deleted_at: sql`now()`,
			deleted_by_profile_id: input.actorProfileId ?? null,
			updated_by_profile_id: input.actorProfileId ?? null,
			updated_at: sql`now()`,
		})
		.where('id', '=', id)
		.where('organization_id', '=', input.organizationId)
		.where('deleted_at', 'is', null)
		.returning(addressColumns)
		.executeTakeFirst();

	return row === undefined ? null : toSafeAddress(row);
}

export interface RegionMvtTileFilters {
	/** Match a specific folder; the literal `'unfiled'` matches folderless regions. */
	readonly regionFolderId?: string;
	/** Case-insensitive substring match on region name. */
	readonly search?: string;
}

export interface RegionMvtTileInput {
	readonly z: number;
	readonly x: number;
	readonly y: number;
	readonly organizationId: string;
	readonly filters?: RegionMvtTileFilters;
}

/**
 * Region polygons as a Mapbox vector tile for the regions explorer map. Mirrors
 * {@link getHabitatMvtTile} but polygon-only (regions are always areas).
 */
export async function getRegionMvtTile(
	db: DbExecutor,
	input: RegionMvtTileInput,
): Promise<Uint8Array> {
	const whereClauses = regionSpatialWhereClauses(input);

	const result = await sql<{ readonly tile: Uint8Array | null }>`
		with
		bounds as (
			select
				st_tileenvelope(${input.z}, ${input.x}, ${input.y}) as geom_3857,
				st_transform(st_tileenvelope(${input.z}, ${input.x}, ${input.y}), 4326) as geom_4326
		),
		tile_rows as (
			select
				r.id,
				r.name,
				r.region_folder_id as "regionFolderId",
				st_asmvtgeom(
					st_transform(r.geom, 3857),
					bounds.geom_3857,
					extent => 4096,
					buffer => 64
				) as geom
			from regions r
			cross join bounds
			where ${sql.join(whereClauses, sql` and `)}
		)
		select coalesce(st_asmvt(tile_rows, 'regions', 4096, 'geom'), ''::bytea) as tile
		from tile_rows
	`.execute(db);

	return result.rows[0]?.tile ?? new Uint8Array();
}

function regionSpatialWhereClauses(input: RegionMvtTileInput): RawBuilder<boolean>[] {
	const whereClauses: RawBuilder<boolean>[] = [
		sql<boolean>`r.organization_id = ${input.organizationId}`,
		sql<boolean>`r.deleted_at is null`,
		sql<boolean>`r.geom && bounds.geom_4326`,
		sql<boolean>`st_intersects(r.geom, bounds.geom_4326)`,
	];

	const folderId = input.filters?.regionFolderId;
	if (folderId === 'unfiled') {
		whereClauses.push(sql<boolean>`r.region_folder_id is null`);
	} else if (folderId !== undefined && folderId.length > 0) {
		whereClauses.push(sql<boolean>`r.region_folder_id = ${folderId}`);
	}

	const search = input.filters?.search?.trim();
	if (search !== undefined && search.length > 0) {
		// position()-based match keeps user input literal — no LIKE wildcard escaping.
		whereClauses.push(sql<boolean>`position(lower(${search}) in lower(r.name)) > 0`);
	}

	return whereClauses;
}

export async function getRegionById(
	db: DbExecutor,
	input: { readonly id: string; readonly organizationId: string },
): Promise<SafeRegion | undefined> {
	const row = await db
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
		.where('id', '=', input.id)
		.where('organization_id', '=', input.organizationId)
		.where('deleted_at', 'is', null)
		.executeTakeFirst();

	return row === undefined ? undefined : toSafeRegion(row);
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
