import { type RawBuilder, sql } from 'kysely';

import type { DbExecutor, GeoJsonGeometry, OwnedGeometryInfo } from '../index.js';
import type { MapExtent } from './map-extent.js';
import { regionMembershipClauses } from './map-region-filter.js';
import { type MapFilterInput, type MapTileInput, mapSurface } from './map-surface.js';
import type { SelectedRow } from './org-owned-writes.js';
import { checkedValues } from './write-references.js';

export interface CreateAddressInput {
	readonly id?: string;
	readonly organizationId: string;
	/**
	 * `unknown`, as `adult-surveillance-commands` and `larval-surveillance-commands`
	 * already spell the same field, and as `geojsonToGeom` below actually takes it
	 * — it stringifies whatever it is handed and lets PostGIS refuse the rest.
	 *
	 * `GeoJsonGeometry` is `Record<string, unknown>`, which the *shape* of a
	 * geometry satisfies but a named geometry type does not: an interface has no
	 * implicit index signature, so `packages/domain`'s `GeoJsonPoint` is refused
	 * here however identical the value is. That is a spelling mismatch between two
	 * packages rather than a check worth keeping, and it is what stopped
	 * `foundation.createAddress` handing its own validated point straight through.
	 */
	readonly geojson: unknown;
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

export const addressColumns = [
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

/**
 * What an address write answers with: the columns it returned, under their own
 * names. `SafeAddress` above is the camelCase reading of the same list, and only
 * the operator console's list and the `/map/*` lookup still read it.
 */
export type AddressRow = SelectedRow<'addresses', typeof addressColumns>;

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

function geojsonToGeom(geojson: unknown): RawBuilder<string> {
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
): Promise<AddressRow> {
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
		.returning(addressColumns)
		.executeTakeFirstOrThrow();

	return row;
}

export async function listAddresses(
	db: DbExecutor,
	organizationId: string,
): Promise<SafeAddress[]> {
	const rows = await db
		.selectFrom('addresses')
		.select(addressColumns)
		.where('organization_id', '=', organizationId)
		.where('deleted_at', 'is', null)
		.orderBy('display_name', 'asc')
		.execute();

	return rows.map(toSafeAddress);
}

export async function getAddressById(
	db: DbExecutor,
	input: { readonly id: string; readonly organizationId: string },
): Promise<SafeAddress | undefined> {
	const row = await getAddressRowById(db, input);
	return row === undefined ? undefined : toSafeAddress(row);
}

/**
 * The same read, unmapped. `foundation.mergeAddresses` answers with the address
 * that survived, and the merge does not write it, so this is the one read on the
 * command path.
 */
export async function getAddressRowById(
	db: DbExecutor,
	input: { readonly id: string; readonly organizationId: string },
): Promise<AddressRow | undefined> {
	return db
		.selectFrom('addresses')
		.select(addressColumns)
		.where('id', '=', input.id)
		.where('organization_id', '=', input.organizationId)
		.where('deleted_at', 'is', null)
		.executeTakeFirst();
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
): Promise<AddressRow | null> {
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

	return row ?? null;
}

export async function updateAddressLocation(
	db: DbExecutor,
	id: string,
	input: {
		readonly organizationId: string;
		/** See `CreateAddressInput.geojson`. */
		readonly geojson: unknown;
		readonly updatedByProfileId?: string | null;
	},
): Promise<AddressRow | null> {
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

	return row ?? null;
}

export async function deleteAddress(
	db: DbExecutor,
	id: string,
	input: { readonly organizationId: string; readonly actorProfileId?: string | null },
): Promise<AddressRow | null> {
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

	return row ?? null;
}

export interface AddressMvtTileFilters {
	/** Case-insensitive substring match on the address display name. */
	readonly search?: string;
	/** Match addresses falling inside any of these regions. */
	readonly regionIds?: readonly string[];
}

export type AddressMvtTileInput = MapTileInput<AddressMvtTileFilters>;

// Addresses are drawn, not listed, from here: the address book reads its rows
// through the catalog above, so this surface is the tile and the framed extent
// and nothing else.
const addressSurface = mapSurface<AddressMvtTileFilters>({
	layer: 'addresses',
	from: sql`addresses a`,
	alias: 'a',
	geom: sql`a.geom`,
	properties: [sql`a.id`, sql`a.display_name as "displayName"`],
	filterWhere: addressFilterWhere,
});

/**
 * Address points as a Mapbox vector tile for the address-book explorer map.
 * Mirrors {@link getRegionMvtTile} but point-only (addresses geocode to a single
 * point). Each feature carries its `id` + `displayName` so the map can label and
 * select points without a second round-trip.
 */
export async function getAddressMvtTile(
	db: DbExecutor,
	input: AddressMvtTileInput,
): Promise<Uint8Array> {
	return addressSurface.getTile(db, input);
}

/**
 * Extent of every address matching the tile filters, ignoring the viewport —
 * what the address-book map frames on load and after a search change.
 */
export async function getAddressMapExtent(
	db: DbExecutor,
	input: MapFilterInput<AddressMvtTileFilters>,
): Promise<MapExtent | null> {
	return addressSurface.getExtent(db, input);
}

function addressFilterWhere(filters: AddressMvtTileFilters | undefined): RawBuilder<boolean>[] {
	const whereClauses: RawBuilder<boolean>[] = [];

	const search = filters?.search?.trim();
	if (search !== undefined && search.length > 0) {
		// position()-based match keeps user input literal — no LIKE wildcard escaping.
		whereClauses.push(sql<boolean>`position(lower(${search}) in lower(a.display_name)) > 0`);
	}

	whereClauses.push(
		...regionMembershipClauses({
			geom: sql`a.geom`,
			organizationId: sql`a.organization_id`,
			regionIds: filters?.regionIds,
		}),
	);

	return whereClauses;
}

export interface RegionMvtTileFilters {
	/** Match a specific folder; the literal `'unfiled'` matches folderless regions. */
	readonly regionFolderId?: string;
	/** Case-insensitive substring match on region name. */
	readonly search?: string;
	/**
	 * Match an explicit region id set. The regions explorer draws only the boxes
	 * the user has ticked, so its camera fits that set rather than every region
	 * the other filters allow.
	 */
	readonly ids?: readonly string[];
}

export type RegionMvtTileInput = MapTileInput<RegionMvtTileFilters>;

// Like addresses, regions are drawn from here and read as rows through the
// catalog below, so this surface is the tile and the framed extent only.
const regionSurface = mapSurface<RegionMvtTileFilters>({
	layer: 'regions',
	from: sql`regions r`,
	alias: 'r',
	geom: sql`r.geom`,
	properties: [sql`r.id`, sql`r.name`, sql`r.region_folder_id as "regionFolderId"`],
	filterWhere: regionFilterWhere,
});

/**
 * Region polygons as a Mapbox vector tile for the regions explorer map. Mirrors
 * {@link getHabitatMvtTile} but polygon-only (regions are always areas).
 */
export async function getRegionMvtTile(
	db: DbExecutor,
	input: RegionMvtTileInput,
): Promise<Uint8Array> {
	return regionSurface.getTile(db, input);
}

/**
 * Extent of every region matching the tile filters, ignoring the viewport —
 * what the regions map frames as the visible set changes.
 */
export async function getRegionMapExtent(
	db: DbExecutor,
	input: MapFilterInput<RegionMvtTileFilters>,
): Promise<MapExtent | null> {
	return regionSurface.getExtent(db, input);
}

function regionFilterWhere(filters: RegionMvtTileFilters | undefined): RawBuilder<boolean>[] {
	const whereClauses: RawBuilder<boolean>[] = [];

	const ids = filters?.ids;
	if (ids !== undefined && ids.length > 0) {
		whereClauses.push(sql<boolean>`r.id = any(${[...ids]}::uuid[])`);
	}

	const folderId = filters?.regionFolderId;
	if (folderId === 'unfiled') {
		whereClauses.push(sql<boolean>`r.region_folder_id is null`);
	} else if (folderId !== undefined && folderId.length > 0) {
		whereClauses.push(sql<boolean>`r.region_folder_id = ${folderId}`);
	}

	const search = filters?.search?.trim();
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
		.values(
			await checkedValues(db, input.organizationId, {
				organization_id: input.organizationId,
				name: input.name,
				description: input.description ?? null,
				created_by_profile_id: input.createdByProfileId ?? null,
				updated_by_profile_id: input.updatedByProfileId ?? input.createdByProfileId ?? null,
			}),
		)
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
		.values(
			await checkedValues(db, input.organizationId, {
				organization_id: input.organizationId,
				region_folder_id: input.regionFolderId ?? null,
				geom: geojsonToGeom(input.geojson),
				name: input.name,
				description: input.description ?? null,
				metadata: input.metadata ?? null,
				created_by_profile_id: input.createdByProfileId ?? null,
				updated_by_profile_id: input.updatedByProfileId ?? input.createdByProfileId ?? null,
			}),
		)
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
