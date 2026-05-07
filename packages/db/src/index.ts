import {
	type ColumnType,
	type Generated,
	Kysely,
	PostgresDialect,
	sql,
	type Transaction,
} from 'kysely';
import pg from 'pg';

const { Pool } = pg;

type TimestampWithDefault = ColumnType<Date, Date | undefined, Date | undefined>;
type NullableTimestampWithDefault = ColumnType<
	Date | null,
	Date | null | undefined,
	Date | null | undefined
>;
type BooleanWithDefault = ColumnType<boolean, boolean | undefined, boolean>;
type JsonColumn = ColumnType<unknown | null, unknown | null | undefined, unknown | null>;
type GeneratedColumn<T> = ColumnType<T, never, never>;

export type SimmerRole = 'owner' | 'admin' | 'manager' | 'collector' | 'viewer';
export type MembershipStatus = 'active' | 'inactive' | 'invited';
export type OrganizationSubscriptionStatus = 'trial' | 'active' | 'suspended' | 'canceled';
export type OrganizationBillingMode = 'manual_invoice';
export type SpatialFeaturePrecisionPolicy = 'preserve' | 'snap_5_decimal';

export type GeoJsonGeometry = Record<string, unknown>;

export interface UsersTable {
	id: Generated<string>;
	workos_user_id: string;
	email: string;
	display_name: string;
	first_name: string | null;
	last_name: string | null;
	email_verified: boolean | null;
	created_at: TimestampWithDefault;
	updated_at: TimestampWithDefault;
}

export interface OrganizationsTable {
	id: Generated<string>;
	workos_organization_id: string | null;
	name: string;
	slug: string | null;
	settings: unknown | null;
	subscription_status: ColumnType<
		OrganizationSubscriptionStatus,
		OrganizationSubscriptionStatus | undefined,
		OrganizationSubscriptionStatus
	>;
	billing_mode: ColumnType<
		OrganizationBillingMode,
		OrganizationBillingMode | undefined,
		OrganizationBillingMode
	>;
	billing_contact_name: string | null;
	billing_contact_email: string | null;
	subscription_notes: string | null;
	main_contact_email: string | null;
	phone_number: string | null;
	mailing_country: string | null;
	mailing_address_line_1: string | null;
	mailing_address_line_2: string | null;
	mailing_locality: string | null;
	mailing_region: string | null;
	mailing_postal_code: string | null;
	created_at: TimestampWithDefault;
	updated_at: TimestampWithDefault;
	deleted_at: NullableTimestampWithDefault;
	deleted_by_profile_id: string | null;
}

export interface ProfilesTable {
	id: Generated<string>;
	organization_id: string;
	user_id: string | null;
	display_name: string;
	email: string | null;
	is_active: BooleanWithDefault;
	created_at: TimestampWithDefault;
	updated_at: TimestampWithDefault;
	deleted_at: NullableTimestampWithDefault;
	deleted_by_profile_id: string | null;
}

export interface MembershipsTable {
	id: Generated<string>;
	organization_id: string;
	user_id: string | null;
	profile_id: string;
	role: SimmerRole;
	status: MembershipStatus;
	is_default: BooleanWithDefault;
	invited_email: string | null;
	workos_invitation_id: string | null;
	created_at: TimestampWithDefault;
	updated_at: TimestampWithDefault;
}

export interface SpatialFeaturesTable {
	id: Generated<string>;
	geom: GeneratedColumn<string>;
	lat: GeneratedColumn<number>;
	lng: GeneratedColumn<number>;
	geojson: GeneratedColumn<GeoJsonGeometry>;
	geom_type: GeneratedColumn<string>;
	created_at: TimestampWithDefault;
}

export interface AddressesTable {
	id: Generated<string>;
	organization_id: string;
	feature_id: string;
	display_name: string;
	country: string;
	address_line_1: string | null;
	address_line_2: string | null;
	locality: string | null;
	region: string | null;
	postal_code: string | null;
	geocoder_response: JsonColumn;
	created_by_profile_id: string | null;
	updated_by_profile_id: string | null;
	created_at: TimestampWithDefault;
	updated_at: TimestampWithDefault;
	deleted_at: NullableTimestampWithDefault;
	deleted_by_profile_id: string | null;
}

export interface RegionFoldersTable {
	id: Generated<string>;
	organization_id: string;
	name: string;
	description: string | null;
	created_by_profile_id: string | null;
	updated_by_profile_id: string | null;
	created_at: TimestampWithDefault;
	updated_at: TimestampWithDefault;
	deleted_at: NullableTimestampWithDefault;
	deleted_by_profile_id: string | null;
}

export interface RegionsTable {
	id: Generated<string>;
	organization_id: string;
	region_folder_id: string | null;
	feature_id: string;
	name: string;
	description: string | null;
	metadata: JsonColumn;
	created_by_profile_id: string | null;
	updated_by_profile_id: string | null;
	created_at: TimestampWithDefault;
	updated_at: TimestampWithDefault;
	deleted_at: NullableTimestampWithDefault;
	deleted_by_profile_id: string | null;
}

export interface GeneraTable {
	id: Generated<string>;
	abbreviation: string;
	name: string;
	created_at: TimestampWithDefault;
	updated_at: TimestampWithDefault;
}

export interface SpeciesTable {
	id: Generated<string>;
	genus_id: string | null;
	epithet: string;
	common_name: string | null;
	display_name: string;
	created_at: TimestampWithDefault;
	updated_at: TimestampWithDefault;
}

export interface OrganizationSpeciesTable {
	id: Generated<string>;
	organization_id: string;
	species_id: string;
	created_by_profile_id: string | null;
	updated_by_profile_id: string | null;
	created_at: TimestampWithDefault;
	updated_at: TimestampWithDefault;
}

interface OrgLookupTable {
	id: Generated<string>;
	organization_id: string;
	name: string;
	description: string | null;
	custom_schema: JsonColumn;
	is_active: BooleanWithDefault;
	created_by_profile_id: string | null;
	updated_by_profile_id: string | null;
	created_at: TimestampWithDefault;
	updated_at: TimestampWithDefault;
	deleted_at: NullableTimestampWithDefault;
	deleted_by_profile_id: string | null;
}

export interface CollectionMethodsTable extends OrgLookupTable {}
export interface CollectionLuresTable extends OrgLookupTable {}
export interface HabitatTypesTable extends OrgLookupTable {}

export interface TrapsTable {
	id: Generated<string>;
	organization_id: string;
	feature_id: string;
	collection_method_id: string;
	address_id: string | null;
	collection_lure_id: string | null;
	trap_name: string | null;
	trap_code: string | null;
	description: string | null;
	is_active: BooleanWithDefault;
	created_by_profile_id: string | null;
	updated_by_profile_id: string | null;
	created_at: TimestampWithDefault;
	updated_at: TimestampWithDefault;
	deleted_at: NullableTimestampWithDefault;
	deleted_by_profile_id: string | null;
}

export interface SimmerDatabase {
	users: UsersTable;
	organizations: OrganizationsTable;
	profiles: ProfilesTable;
	memberships: MembershipsTable;
	spatial_features: SpatialFeaturesTable;
	addresses: AddressesTable;
	region_folders: RegionFoldersTable;
	regions: RegionsTable;
	genera: GeneraTable;
	species: SpeciesTable;
	organization_species: OrganizationSpeciesTable;
	collection_methods: CollectionMethodsTable;
	collection_lures: CollectionLuresTable;
	habitat_types: HabitatTypesTable;
	traps: TrapsTable;
}

export interface CreateDbOptions {
	readonly databaseUrl: string;
	readonly maxConnections?: number;
}

export function createDb(options: CreateDbOptions): Kysely<SimmerDatabase> {
	return new Kysely<SimmerDatabase>({
		dialect: new PostgresDialect({
			pool: new Pool({
				connectionString: options.databaseUrl,
				max: options.maxConnections ?? 10,
			}),
		}),
	});
}

export interface WorkOsIdentityInput {
	readonly workosUserId: string;
	readonly email: string;
	readonly displayName: string;
	readonly firstName: string | null;
	readonly lastName: string | null;
	readonly emailVerified: boolean | null;
	readonly workosOrganizationId: string | null;
	readonly workosOrganizationName?: string | null;
	readonly workosRole?: string | null;
}

export interface LocalIdentity {
	readonly userId: string;
	readonly organizationId: string | null;
	readonly profileId: string | null;
	readonly membershipId: string | null;
	readonly role: SimmerRole | null;
}

export interface ActiveLocalAuthIdentity {
	readonly user: {
		readonly id: string;
		readonly workosUserId: string;
		readonly email: string;
		readonly displayName: string;
		readonly firstName: string | null;
		readonly lastName: string | null;
		readonly emailVerified: boolean | null;
	};
	readonly organization: {
		readonly id: string;
		readonly workosOrganizationId: string;
		readonly name: string;
		readonly slug: string | null;
	};
	readonly profile: {
		readonly id: string;
		readonly organizationId: string;
		readonly userId: string | null;
		readonly displayName: string;
		readonly email: string | null;
	};
	readonly membership: {
		readonly id: string;
		readonly organizationId: string;
		readonly userId: string;
		readonly profileId: string;
		readonly role: SimmerRole;
		readonly status: MembershipStatus;
		readonly isDefault: boolean;
	};
}

export interface OrganizationSubscriptionMetadata {
	readonly subscriptionStatus: OrganizationSubscriptionStatus;
	readonly billingMode: OrganizationBillingMode;
	readonly billingContactName: string | null;
	readonly billingContactEmail: string | null;
	readonly subscriptionNotes: string | null;
}

export interface OrganizationContactInfo {
	readonly mainContactEmail: string | null;
	readonly phoneNumber: string | null;
	readonly mailingCountry: string | null;
	readonly mailingAddressLine1: string | null;
	readonly mailingAddressLine2: string | null;
	readonly mailingLocality: string | null;
	readonly mailingRegion: string | null;
	readonly mailingPostalCode: string | null;
}

export interface SafeOrganization {
	readonly id: string;
	readonly workosOrganizationId: string | null;
	readonly name: string;
	readonly slug: string | null;
	readonly subscription: OrganizationSubscriptionMetadata;
	readonly contact: OrganizationContactInfo;
	readonly ownerLinked: boolean;
	readonly createdAt: Date;
	readonly updatedAt: Date;
}

export interface SafeOrganizationMembership {
	readonly id: string;
	readonly organizationId: string;
	readonly userId: string | null;
	readonly profileId: string;
	readonly role: SimmerRole;
	readonly status: MembershipStatus;
	readonly isDefault: boolean;
	readonly invitedEmail: string | null;
	readonly workosInvitationId: string | null;
	readonly profile: {
		readonly displayName: string;
		readonly email: string | null;
		readonly isActive: boolean;
	};
	readonly createdAt: Date;
	readonly updatedAt: Date;
}

export interface UpsertOperatorOrganizationInput extends OrganizationSubscriptionMetadata {
	readonly workosOrganizationId: string;
	readonly name: string;
	readonly slug: string | null;
	readonly contact: OrganizationContactInfo;
	readonly ownerUserId?: string;
	readonly ownerDisplayName?: string;
	readonly ownerEmail?: string;
}

export interface StageOrganizationInvitationInput {
	readonly organizationId: string;
	readonly email: string;
	readonly displayName: string | null;
	readonly role: SimmerRole;
	readonly workosInvitationId: string;
}

export interface SpatialFeatureInfo {
	readonly id: string;
	readonly lat: number;
	readonly lng: number;
	readonly geojson: GeoJsonGeometry;
	readonly geomType: string;
	readonly createdAt: Date;
}

export interface CreateSpatialFeatureInput {
	readonly geojson: GeoJsonGeometry;
	readonly precisionPolicy?: SpatialFeaturePrecisionPolicy;
}

export interface CreateAddressInput {
	readonly organizationId: string;
	readonly featureId: string;
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
	readonly featureId: string;
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
	readonly featureId: string;
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
	readonly featureId: string;
	readonly name: string;
	readonly description: string | null;
	readonly metadata: unknown | null;
	readonly createdByProfileId: string | null;
	readonly updatedByProfileId: string | null;
	readonly createdAt: Date;
	readonly updatedAt: Date;
}

export interface CreateGenusInput {
	readonly abbreviation: string;
	readonly name: string;
}

export interface SafeGenus {
	readonly id: string;
	readonly abbreviation: string;
	readonly name: string;
	readonly createdAt: Date;
	readonly updatedAt: Date;
}

export interface CreateSpeciesInput {
	readonly genusId?: string | null;
	readonly epithet: string;
	readonly commonName?: string | null;
	readonly displayName: string;
}

export interface SafeSpecies {
	readonly id: string;
	readonly genusId: string | null;
	readonly epithet: string;
	readonly commonName: string | null;
	readonly displayName: string;
	readonly createdAt: Date;
	readonly updatedAt: Date;
}

export interface EnableOrganizationSpeciesInput {
	readonly organizationId: string;
	readonly speciesId: string;
	readonly createdByProfileId?: string | null;
	readonly updatedByProfileId?: string | null;
}

export interface SafeOrganizationSpecies {
	readonly id: string;
	readonly organizationId: string;
	readonly speciesId: string;
	readonly createdByProfileId: string | null;
	readonly updatedByProfileId: string | null;
	readonly createdAt: Date;
	readonly updatedAt: Date;
}

export type OrgLookupKind = 'collection_methods' | 'collection_lures' | 'habitat_types';

export interface CreateOrgLookupInput {
	readonly organizationId: string;
	readonly name: string;
	readonly description?: string | null;
	readonly customSchema?: unknown | null;
	readonly isActive?: boolean;
	readonly createdByProfileId?: string | null;
	readonly updatedByProfileId?: string | null;
}

export interface SafeOrgLookup {
	readonly id: string;
	readonly organizationId: string;
	readonly name: string;
	readonly description: string | null;
	readonly customSchema: unknown | null;
	readonly isActive: boolean;
	readonly createdByProfileId: string | null;
	readonly updatedByProfileId: string | null;
	readonly createdAt: Date;
	readonly updatedAt: Date;
}

export interface CreateTrapInput {
	readonly organizationId: string;
	readonly featureId: string;
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
	readonly featureId: string;
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

interface MembershipProvisioningCandidate {
	readonly id: string;
	readonly profileId: string;
	readonly role: SimmerRole;
}

export function resolveMembershipProvisioning(input: {
	readonly existingMembership: MembershipProvisioningCandidate | null;
	readonly invitedMembership: MembershipProvisioningCandidate | null;
	readonly existingMembershipCount: number;
}):
	| {
			readonly source: 'existing' | 'invited';
			readonly membershipId: string;
			readonly profileId: string;
			readonly role: SimmerRole;
			readonly isDefault: false;
	  }
	| {
			readonly source: 'new';
			readonly role: SimmerRole;
			readonly isDefault: boolean;
	  } {
	if (input.existingMembership !== null) {
		return {
			source: 'existing',
			membershipId: input.existingMembership.id,
			profileId: input.existingMembership.profileId,
			role: input.existingMembership.role,
			isDefault: false,
		};
	}

	if (input.invitedMembership !== null) {
		return {
			source: 'invited',
			membershipId: input.invitedMembership.id,
			profileId: input.invitedMembership.profileId,
			role: input.invitedMembership.role,
			isDefault: false,
		};
	}

	const isFirstMembership = input.existingMembershipCount === 0;
	return {
		source: 'new',
		role: isFirstMembership ? 'owner' : 'viewer',
		isDefault: isFirstMembership,
	};
}

type DbExecutor = Kysely<SimmerDatabase> | Transaction<SimmerDatabase>;

export async function createSpatialFeature(
	db: DbExecutor,
	input: CreateSpatialFeatureInput,
): Promise<SpatialFeatureInfo> {
	const precisionPolicy = input.precisionPolicy ?? 'preserve';
	const geojson = JSON.stringify(input.geojson);

	const row = await db
		.selectNoFrom(
			sql<string>`get_or_create_spatial_feature(
				${geojson}::jsonb,
				${precisionPolicy}
			)`.as('id'),
		)
		.executeTakeFirstOrThrow();

	return getSpatialFeature(db, row.id);
}

export async function getSpatialFeature(
	db: DbExecutor,
	featureId: string,
): Promise<SpatialFeatureInfo> {
	const row = await db
		.selectFrom('spatial_features')
		.select(['id', 'lat', 'lng', 'geojson', 'geom_type', 'created_at'])
		.where('id', '=', featureId)
		.executeTakeFirstOrThrow();

	return toSpatialFeatureInfo(row);
}

export async function createAddress(
	db: DbExecutor,
	input: CreateAddressInput,
): Promise<SafeAddress> {
	const row = await db
		.insertInto('addresses')
		.values({
			organization_id: input.organizationId,
			feature_id: input.featureId,
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
			'feature_id',
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
			'feature_id',
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
			feature_id: input.featureId,
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
			'feature_id',
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
			'feature_id',
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

export async function createGenus(db: DbExecutor, input: CreateGenusInput): Promise<SafeGenus> {
	const row = await db
		.insertInto('genera')
		.values({
			abbreviation: input.abbreviation,
			name: input.name,
		})
		.returning(['id', 'abbreviation', 'name', 'created_at', 'updated_at'])
		.executeTakeFirstOrThrow();

	return toSafeGenus(row);
}

export async function listGenera(db: DbExecutor): Promise<SafeGenus[]> {
	const rows = await db
		.selectFrom('genera')
		.select(['id', 'abbreviation', 'name', 'created_at', 'updated_at'])
		.orderBy('name', 'asc')
		.execute();

	return rows.map(toSafeGenus);
}

export async function createSpecies(
	db: DbExecutor,
	input: CreateSpeciesInput,
): Promise<SafeSpecies> {
	const row = await db
		.insertInto('species')
		.values({
			genus_id: input.genusId ?? null,
			epithet: input.epithet,
			common_name: input.commonName ?? null,
			display_name: input.displayName,
		})
		.returning([
			'id',
			'genus_id',
			'epithet',
			'common_name',
			'display_name',
			'created_at',
			'updated_at',
		])
		.executeTakeFirstOrThrow();

	return toSafeSpecies(row);
}

export async function listSpecies(db: DbExecutor): Promise<SafeSpecies[]> {
	const rows = await db
		.selectFrom('species')
		.select([
			'id',
			'genus_id',
			'epithet',
			'common_name',
			'display_name',
			'created_at',
			'updated_at',
		])
		.orderBy('display_name', 'asc')
		.execute();

	return rows.map(toSafeSpecies);
}

export async function enableOrganizationSpecies(
	db: DbExecutor,
	input: EnableOrganizationSpeciesInput,
): Promise<SafeOrganizationSpecies> {
	const row = await db
		.insertInto('organization_species')
		.values({
			organization_id: input.organizationId,
			species_id: input.speciesId,
			created_by_profile_id: input.createdByProfileId ?? null,
			updated_by_profile_id: input.updatedByProfileId ?? input.createdByProfileId ?? null,
		})
		.onConflict((oc) =>
			oc.columns(['organization_id', 'species_id']).doUpdateSet({
				updated_by_profile_id: input.updatedByProfileId ?? input.createdByProfileId ?? null,
				updated_at: sql`now()`,
			}),
		)
		.returning([
			'id',
			'organization_id',
			'species_id',
			'created_by_profile_id',
			'updated_by_profile_id',
			'created_at',
			'updated_at',
		])
		.executeTakeFirstOrThrow();

	return toSafeOrganizationSpecies(row);
}

export async function listOrganizationSpecies(
	db: DbExecutor,
	organizationId: string,
): Promise<SafeOrganizationSpecies[]> {
	const rows = await db
		.selectFrom('organization_species')
		.select([
			'id',
			'organization_id',
			'species_id',
			'created_by_profile_id',
			'updated_by_profile_id',
			'created_at',
			'updated_at',
		])
		.where('organization_id', '=', organizationId)
		.orderBy('created_at', 'asc')
		.execute();

	return rows.map(toSafeOrganizationSpecies);
}

export async function createOrgLookup(
	db: DbExecutor,
	kind: OrgLookupKind,
	input: CreateOrgLookupInput,
): Promise<SafeOrgLookup> {
	const row = await db
		.insertInto(kind)
		.values({
			organization_id: input.organizationId,
			name: input.name,
			description: input.description ?? null,
			custom_schema: input.customSchema ?? null,
			is_active: input.isActive ?? true,
			created_by_profile_id: input.createdByProfileId ?? null,
			updated_by_profile_id: input.updatedByProfileId ?? input.createdByProfileId ?? null,
		})
		.returning([
			'id',
			'organization_id',
			'name',
			'description',
			'custom_schema',
			'is_active',
			'created_by_profile_id',
			'updated_by_profile_id',
			'created_at',
			'updated_at',
		])
		.executeTakeFirstOrThrow();

	return toSafeOrgLookup(row);
}

export async function listOrgLookups(
	db: DbExecutor,
	kind: OrgLookupKind,
	organizationId: string,
): Promise<SafeOrgLookup[]> {
	const rows = await db
		.selectFrom(kind)
		.select([
			'id',
			'organization_id',
			'name',
			'description',
			'custom_schema',
			'is_active',
			'created_by_profile_id',
			'updated_by_profile_id',
			'created_at',
			'updated_at',
		])
		.where('organization_id', '=', organizationId)
		.where('deleted_at', 'is', null)
		.orderBy('name', 'asc')
		.execute();

	return rows.map(toSafeOrgLookup);
}

const trapReturnColumns = [
	'id',
	'organization_id',
	'feature_id',
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
			feature_id: input.featureId,
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

export async function upsertWorkOsIdentity(
	db: Kysely<SimmerDatabase>,
	input: WorkOsIdentityInput,
): Promise<LocalIdentity> {
	return db.transaction().execute(async (trx) => {
		const user = await trx
			.insertInto('users')
			.values({
				workos_user_id: input.workosUserId,
				email: input.email,
				display_name: input.displayName,
				first_name: input.firstName,
				last_name: input.lastName,
				email_verified: input.emailVerified,
			})
			.onConflict((oc) =>
				oc.column('workos_user_id').doUpdateSet({
					email: input.email,
					display_name: input.displayName,
					first_name: input.firstName,
					last_name: input.lastName,
					email_verified: input.emailVerified,
					updated_at: sql`now()`,
				}),
			)
			.returning(['id'])
			.executeTakeFirstOrThrow();

		if (input.workosOrganizationId === null) {
			return {
				userId: user.id,
				organizationId: null,
				profileId: null,
				membershipId: null,
				role: null,
			};
		}

		const organizationName = input.workosOrganizationName ?? input.workosOrganizationId;

		const organization = await trx
			.insertInto('organizations')
			.values({
				workos_organization_id: input.workosOrganizationId,
				name: organizationName,
			})
			.onConflict((oc) =>
				oc.column('workos_organization_id').doUpdateSet({
					name: organizationName,
					updated_at: sql`now()`,
				}),
			)
			.returning(['id'])
			.executeTakeFirstOrThrow();

		const existingMembershipCount = await trx
			.selectFrom('memberships')
			.select(({ fn }) => fn.countAll<number>().as('count'))
			.where('organization_id', '=', organization.id)
			.executeTakeFirstOrThrow();

		const existingMembership = await trx
			.selectFrom('memberships')
			.select(['id', 'profile_id', 'role'])
			.where('organization_id', '=', organization.id)
			.where('user_id', '=', user.id)
			.executeTakeFirst();

		const normalizedEmail = normalizeEmail(input.email);
		const invitedMembership = await trx
			.selectFrom('memberships')
			.select(['id', 'profile_id', 'role'])
			.where('organization_id', '=', organization.id)
			.where('user_id', 'is', null)
			.where('status', '=', 'invited')
			.where(sql<boolean>`lower(${sql.ref('invited_email')}) = ${normalizedEmail}`)
			.executeTakeFirst();

		const provisioning = resolveMembershipProvisioning({
			existingMembership:
				existingMembership === undefined
					? null
					: {
							id: existingMembership.id,
							profileId: existingMembership.profile_id,
							role: existingMembership.role,
						},
			invitedMembership:
				invitedMembership === undefined
					? null
					: {
							id: invitedMembership.id,
							profileId: invitedMembership.profile_id,
							role: invitedMembership.role,
						},
			existingMembershipCount: Number(existingMembershipCount.count),
		});

		if (provisioning.source === 'existing' || provisioning.source === 'invited') {
			await trx
				.updateTable('profiles')
				.set({
					user_id: user.id,
					display_name: input.displayName,
					email: input.email,
					is_active: true,
					deleted_at: null,
					deleted_by_profile_id: null,
					updated_at: sql`now()`,
				})
				.where('id', '=', provisioning.profileId)
				.executeTakeFirstOrThrow();

			const membership = await trx
				.updateTable('memberships')
				.set({
					user_id: user.id,
					status: 'active',
					updated_at: sql`now()`,
				})
				.where('id', '=', provisioning.membershipId)
				.returning(['id', 'profile_id', 'role'])
				.executeTakeFirstOrThrow();

			return {
				userId: user.id,
				organizationId: organization.id,
				profileId: membership.profile_id,
				membershipId: membership.id,
				role: membership.role,
			};
		}

		const profile = await trx
			.insertInto('profiles')
			.values({
				organization_id: organization.id,
				user_id: user.id,
				display_name: input.displayName,
				email: input.email,
			})
			.onConflict((oc) =>
				oc.columns(['organization_id', 'user_id']).doUpdateSet({
					display_name: input.displayName,
					email: input.email,
					is_active: true,
					deleted_at: null,
					deleted_by_profile_id: null,
					updated_at: sql`now()`,
				}),
			)
			.returning(['id'])
			.executeTakeFirstOrThrow();

		const membership = await trx
			.insertInto('memberships')
			.values({
				organization_id: organization.id,
				user_id: user.id,
				profile_id: profile.id,
				role: provisioning.role,
				status: 'active',
				is_default: provisioning.isDefault,
			})
			.returning(['id', 'role'])
			.executeTakeFirstOrThrow();

		return {
			userId: user.id,
			organizationId: organization.id,
			profileId: profile.id,
			membershipId: membership.id,
			role: membership.role,
		};
	});
}

export async function upsertOperatorOrganization(
	db: Kysely<SimmerDatabase>,
	input: UpsertOperatorOrganizationInput,
): Promise<SafeOrganization> {
	return db.transaction().execute(async (trx) => {
		const organization = await trx
			.insertInto('organizations')
			.values({
				workos_organization_id: input.workosOrganizationId,
				name: input.name,
				slug: input.slug,
				subscription_status: input.subscriptionStatus,
				billing_mode: input.billingMode,
				billing_contact_name: input.billingContactName,
				billing_contact_email: input.billingContactEmail,
				subscription_notes: input.subscriptionNotes,
				main_contact_email: input.contact.mainContactEmail,
				phone_number: input.contact.phoneNumber,
				mailing_country: input.contact.mailingCountry,
				mailing_address_line_1: input.contact.mailingAddressLine1,
				mailing_address_line_2: input.contact.mailingAddressLine2,
				mailing_locality: input.contact.mailingLocality,
				mailing_region: input.contact.mailingRegion,
				mailing_postal_code: input.contact.mailingPostalCode,
			})
			.onConflict((oc) =>
				oc.column('workos_organization_id').doUpdateSet({
					name: input.name,
					slug: input.slug,
					subscription_status: input.subscriptionStatus,
					billing_mode: input.billingMode,
					billing_contact_name: input.billingContactName,
					billing_contact_email: input.billingContactEmail,
					subscription_notes: input.subscriptionNotes,
					main_contact_email: input.contact.mainContactEmail,
					phone_number: input.contact.phoneNumber,
					mailing_country: input.contact.mailingCountry,
					mailing_address_line_1: input.contact.mailingAddressLine1,
					mailing_address_line_2: input.contact.mailingAddressLine2,
					mailing_locality: input.contact.mailingLocality,
					mailing_region: input.contact.mailingRegion,
					mailing_postal_code: input.contact.mailingPostalCode,
					updated_at: sql`now()`,
				}),
			)
			.returning([
				'id',
				'workos_organization_id',
				'name',
				'slug',
				'subscription_status',
				'billing_mode',
				'billing_contact_name',
				'billing_contact_email',
				'subscription_notes',
				'main_contact_email',
				'phone_number',
				'mailing_country',
				'mailing_address_line_1',
				'mailing_address_line_2',
				'mailing_locality',
				'mailing_region',
				'mailing_postal_code',
				'created_at',
				'updated_at',
			])
			.executeTakeFirstOrThrow();

		let ownerLinked = false;
		if (input.ownerUserId !== undefined) {
			const profile = await trx
				.insertInto('profiles')
				.values({
					organization_id: organization.id,
					user_id: input.ownerUserId,
					display_name: input.ownerDisplayName ?? input.ownerEmail ?? 'SIMMER Operator',
					email: input.ownerEmail ?? null,
				})
				.onConflict((oc) =>
					oc.columns(['organization_id', 'user_id']).doUpdateSet({
						display_name: input.ownerDisplayName ?? input.ownerEmail ?? 'SIMMER Operator',
						email: input.ownerEmail ?? null,
						is_active: true,
						deleted_at: null,
						deleted_by_profile_id: null,
						updated_at: sql`now()`,
					}),
				)
				.returning(['id'])
				.executeTakeFirstOrThrow();

			const existingMembership = await trx
				.selectFrom('memberships')
				.select(['id'])
				.where('organization_id', '=', organization.id)
				.where('user_id', '=', input.ownerUserId)
				.executeTakeFirst();

			if (existingMembership === undefined) {
				await trx
					.insertInto('memberships')
					.values({
						organization_id: organization.id,
						user_id: input.ownerUserId,
						profile_id: profile.id,
						role: 'owner',
						status: 'active',
						is_default: false,
					})
					.execute();
			} else {
				await trx
					.updateTable('memberships')
					.set({
						profile_id: profile.id,
						role: 'owner',
						status: 'active',
						updated_at: sql`now()`,
					})
					.where('id', '=', existingMembership.id)
					.execute();
			}

			ownerLinked = true;
		}

		return toSafeOrganization(organization, ownerLinked);
	});
}

export async function listOperatorOrganizations(
	db: Kysely<SimmerDatabase>,
): Promise<SafeOrganization[]> {
	const rows = await db
		.selectFrom('organizations')
		.select([
			'id',
			'workos_organization_id',
			'name',
			'slug',
			'subscription_status',
			'billing_mode',
			'billing_contact_name',
			'billing_contact_email',
			'subscription_notes',
			'main_contact_email',
			'phone_number',
			'mailing_country',
			'mailing_address_line_1',
			'mailing_address_line_2',
			'mailing_locality',
			'mailing_region',
			'mailing_postal_code',
			'created_at',
			'updated_at',
		])
		.where('deleted_at', 'is', null)
		.orderBy('created_at', 'desc')
		.execute();

	return rows.map((row) => toSafeOrganization(row, false));
}

export async function getOperatorOrganization(
	db: Kysely<SimmerDatabase>,
	organizationId: string,
): Promise<SafeOrganization | null> {
	const row = await db
		.selectFrom('organizations')
		.select([
			'id',
			'workos_organization_id',
			'name',
			'slug',
			'subscription_status',
			'billing_mode',
			'billing_contact_name',
			'billing_contact_email',
			'subscription_notes',
			'main_contact_email',
			'phone_number',
			'mailing_country',
			'mailing_address_line_1',
			'mailing_address_line_2',
			'mailing_locality',
			'mailing_region',
			'mailing_postal_code',
			'created_at',
			'updated_at',
		])
		.where('id', '=', organizationId)
		.where('deleted_at', 'is', null)
		.executeTakeFirst();

	return row === undefined ? null : toSafeOrganization(row, false);
}

export async function listOrganizationMemberships(
	db: Kysely<SimmerDatabase>,
	organizationId: string,
): Promise<SafeOrganizationMembership[]> {
	const rows = await db
		.selectFrom('memberships')
		.innerJoin('profiles', 'profiles.id', 'memberships.profile_id')
		.select([
			'memberships.id',
			'memberships.organization_id',
			'memberships.user_id',
			'memberships.profile_id',
			'memberships.role',
			'memberships.status',
			'memberships.is_default',
			'memberships.invited_email',
			'memberships.workos_invitation_id',
			'memberships.created_at',
			'memberships.updated_at',
			'profiles.display_name as profile_display_name',
			'profiles.email as profile_email',
			'profiles.is_active as profile_is_active',
		])
		.where('memberships.organization_id', '=', organizationId)
		.orderBy('memberships.created_at', 'desc')
		.execute();

	return rows.map((row) =>
		toSafeOrganizationMembership({
			id: row.id,
			organization_id: row.organization_id,
			user_id: row.user_id,
			profile_id: row.profile_id,
			role: row.role,
			status: row.status,
			is_default: row.is_default,
			invited_email: row.invited_email,
			workos_invitation_id: row.workos_invitation_id,
			created_at: row.created_at,
			updated_at: row.updated_at,
			profile_display_name: row.profile_display_name,
			profile_email: row.profile_email,
			profile_is_active: row.profile_is_active,
		}),
	);
}

export async function stageOrganizationInvitation(
	db: Kysely<SimmerDatabase>,
	input: StageOrganizationInvitationInput,
): Promise<SafeOrganizationMembership> {
	return db.transaction().execute(async (trx) => {
		const normalizedEmail = normalizeEmail(input.email);
		const displayName = input.displayName ?? input.email;
		const existingMembership = await trx
			.selectFrom('memberships')
			.innerJoin('profiles', 'profiles.id', 'memberships.profile_id')
			.select(['memberships.id', 'memberships.profile_id', 'profiles.id as joined_profile_id'])
			.where('memberships.organization_id', '=', input.organizationId)
			.where('memberships.user_id', 'is', null)
			.where('memberships.status', '=', 'invited')
			.where(sql<boolean>`lower(${sql.ref('memberships.invited_email')}) = ${normalizedEmail}`)
			.executeTakeFirst();

		if (existingMembership !== undefined) {
			await trx
				.updateTable('profiles')
				.set({
					display_name: displayName,
					email: normalizedEmail,
					is_active: true,
					deleted_at: null,
					deleted_by_profile_id: null,
					updated_at: sql`now()`,
				})
				.where('id', '=', existingMembership.joined_profile_id)
				.executeTakeFirstOrThrow();

			const updated = await trx
				.updateTable('memberships')
				.set({
					role: input.role,
					invited_email: normalizedEmail,
					workos_invitation_id: input.workosInvitationId,
					updated_at: sql`now()`,
				})
				.where('id', '=', existingMembership.id)
				.returningAll()
				.executeTakeFirstOrThrow();

			return selectSafeOrganizationMembership(trx, updated.id);
		}

		const profile = await trx
			.insertInto('profiles')
			.values({
				organization_id: input.organizationId,
				user_id: null,
				display_name: displayName,
				email: normalizedEmail,
			})
			.returning(['id'])
			.executeTakeFirstOrThrow();

		const membership = await trx
			.insertInto('memberships')
			.values({
				organization_id: input.organizationId,
				user_id: null,
				profile_id: profile.id,
				role: input.role,
				status: 'invited',
				is_default: false,
				invited_email: normalizedEmail,
				workos_invitation_id: input.workosInvitationId,
			})
			.returning(['id'])
			.executeTakeFirstOrThrow();

		return selectSafeOrganizationMembership(trx, membership.id);
	});
}

export async function resolveActiveLocalAuthIdentity(
	db: Kysely<SimmerDatabase>,
	input: {
		readonly workosUserId: string;
		readonly workosOrganizationId: string;
	},
): Promise<ActiveLocalAuthIdentity | null> {
	const row = await db
		.selectFrom('users')
		.innerJoin('memberships', 'memberships.user_id', 'users.id')
		.innerJoin('organizations', 'organizations.id', 'memberships.organization_id')
		.innerJoin('profiles', 'profiles.id', 'memberships.profile_id')
		.select([
			'users.id as user_id',
			'users.workos_user_id as user_workos_user_id',
			'users.email as user_email',
			'users.display_name as user_display_name',
			'users.first_name as user_first_name',
			'users.last_name as user_last_name',
			'users.email_verified as user_email_verified',
			'organizations.id as organization_id',
			'organizations.workos_organization_id as organization_workos_organization_id',
			'organizations.name as organization_name',
			'organizations.slug as organization_slug',
			'profiles.id as profile_id',
			'profiles.organization_id as profile_organization_id',
			'profiles.user_id as profile_user_id',
			'profiles.display_name as profile_display_name',
			'profiles.email as profile_email',
			'memberships.id as membership_id',
			'memberships.organization_id as membership_organization_id',
			'memberships.user_id as membership_user_id',
			'memberships.profile_id as membership_profile_id',
			'memberships.role as membership_role',
			'memberships.status as membership_status',
			'memberships.is_default as membership_is_default',
		])
		.where('users.workos_user_id', '=', input.workosUserId)
		.where('organizations.workos_organization_id', '=', input.workosOrganizationId)
		.where('organizations.deleted_at', 'is', null)
		.where('memberships.status', '=', 'active')
		.where('memberships.user_id', 'is not', null)
		.where('profiles.is_active', '=', true)
		.where('profiles.deleted_at', 'is', null)
		.executeTakeFirst();

	if (
		row === undefined ||
		row.organization_workos_organization_id === null ||
		row.membership_user_id === null
	) {
		return null;
	}

	return {
		user: {
			id: row.user_id,
			workosUserId: row.user_workos_user_id,
			email: row.user_email,
			displayName: row.user_display_name,
			firstName: row.user_first_name,
			lastName: row.user_last_name,
			emailVerified: row.user_email_verified,
		},
		organization: {
			id: row.organization_id,
			workosOrganizationId: row.organization_workos_organization_id,
			name: row.organization_name,
			slug: row.organization_slug,
		},
		profile: {
			id: row.profile_id,
			organizationId: row.profile_organization_id,
			userId: row.profile_user_id,
			displayName: row.profile_display_name,
			email: row.profile_email,
		},
		membership: {
			id: row.membership_id,
			organizationId: row.membership_organization_id,
			userId: row.membership_user_id,
			profileId: row.membership_profile_id,
			role: row.membership_role,
			status: row.membership_status,
			isDefault: row.membership_is_default,
		},
	};
}

function toSafeOrganization(
	row: {
		readonly id: string;
		readonly workos_organization_id: string | null;
		readonly name: string;
		readonly slug: string | null;
		readonly subscription_status: OrganizationSubscriptionStatus;
		readonly billing_mode: OrganizationBillingMode;
		readonly billing_contact_name: string | null;
		readonly billing_contact_email: string | null;
		readonly subscription_notes: string | null;
		readonly main_contact_email: string | null;
		readonly phone_number: string | null;
		readonly mailing_country: string | null;
		readonly mailing_address_line_1: string | null;
		readonly mailing_address_line_2: string | null;
		readonly mailing_locality: string | null;
		readonly mailing_region: string | null;
		readonly mailing_postal_code: string | null;
		readonly created_at: Date;
		readonly updated_at: Date;
	},
	ownerLinked: boolean,
): SafeOrganization {
	return {
		id: row.id,
		workosOrganizationId: row.workos_organization_id,
		name: row.name,
		slug: row.slug,
		subscription: {
			subscriptionStatus: row.subscription_status,
			billingMode: row.billing_mode,
			billingContactName: row.billing_contact_name,
			billingContactEmail: row.billing_contact_email,
			subscriptionNotes: row.subscription_notes,
		},
		contact: {
			mainContactEmail: row.main_contact_email,
			phoneNumber: row.phone_number,
			mailingCountry: row.mailing_country,
			mailingAddressLine1: row.mailing_address_line_1,
			mailingAddressLine2: row.mailing_address_line_2,
			mailingLocality: row.mailing_locality,
			mailingRegion: row.mailing_region,
			mailingPostalCode: row.mailing_postal_code,
		},
		ownerLinked,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

async function selectSafeOrganizationMembership(
	db: Kysely<SimmerDatabase> | Transaction<SimmerDatabase>,
	membershipId: string,
): Promise<SafeOrganizationMembership> {
	const row = await db
		.selectFrom('memberships')
		.innerJoin('profiles', 'profiles.id', 'memberships.profile_id')
		.select([
			'memberships.id',
			'memberships.organization_id',
			'memberships.user_id',
			'memberships.profile_id',
			'memberships.role',
			'memberships.status',
			'memberships.is_default',
			'memberships.invited_email',
			'memberships.workos_invitation_id',
			'memberships.created_at',
			'memberships.updated_at',
			'profiles.display_name as profile_display_name',
			'profiles.email as profile_email',
			'profiles.is_active as profile_is_active',
		])
		.where('memberships.id', '=', membershipId)
		.executeTakeFirstOrThrow();

	return toSafeOrganizationMembership({
		id: row.id,
		organization_id: row.organization_id,
		user_id: row.user_id,
		profile_id: row.profile_id,
		role: row.role,
		status: row.status,
		is_default: row.is_default,
		invited_email: row.invited_email,
		workos_invitation_id: row.workos_invitation_id,
		created_at: row.created_at,
		updated_at: row.updated_at,
		profile_display_name: row.profile_display_name,
		profile_email: row.profile_email,
		profile_is_active: row.profile_is_active,
	});
}

function toSafeOrganizationMembership(row: {
	readonly id: string;
	readonly organization_id: string;
	readonly user_id: string | null;
	readonly profile_id: string;
	readonly role: SimmerRole;
	readonly status: MembershipStatus;
	readonly is_default: boolean;
	readonly invited_email: string | null;
	readonly workos_invitation_id: string | null;
	readonly created_at: Date;
	readonly updated_at: Date;
	readonly profile_display_name: string;
	readonly profile_email: string | null;
	readonly profile_is_active: boolean;
}): SafeOrganizationMembership {
	return {
		id: row.id,
		organizationId: row.organization_id,
		userId: row.user_id,
		profileId: row.profile_id,
		role: row.role,
		status: row.status,
		isDefault: row.is_default,
		invitedEmail: row.invited_email,
		workosInvitationId: row.workos_invitation_id,
		profile: {
			displayName: row.profile_display_name,
			email: row.profile_email,
			isActive: row.profile_is_active,
		},
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

function toSpatialFeatureInfo(row: {
	readonly id: string;
	readonly lat: number;
	readonly lng: number;
	readonly geojson: GeoJsonGeometry;
	readonly geom_type: string;
	readonly created_at: Date;
}): SpatialFeatureInfo {
	return {
		id: row.id,
		lat: row.lat,
		lng: row.lng,
		geojson: row.geojson,
		geomType: row.geom_type,
		createdAt: row.created_at,
	};
}

function toSafeAddress(row: {
	readonly id: string;
	readonly organization_id: string;
	readonly feature_id: string;
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
		featureId: row.feature_id,
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
	readonly feature_id: string;
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
		featureId: row.feature_id,
		name: row.name,
		description: row.description,
		metadata: row.metadata,
		createdByProfileId: row.created_by_profile_id,
		updatedByProfileId: row.updated_by_profile_id,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

function toSafeGenus(row: {
	readonly id: string;
	readonly abbreviation: string;
	readonly name: string;
	readonly created_at: Date;
	readonly updated_at: Date;
}): SafeGenus {
	return {
		id: row.id,
		abbreviation: row.abbreviation,
		name: row.name,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

function toSafeSpecies(row: {
	readonly id: string;
	readonly genus_id: string | null;
	readonly epithet: string;
	readonly common_name: string | null;
	readonly display_name: string;
	readonly created_at: Date;
	readonly updated_at: Date;
}): SafeSpecies {
	return {
		id: row.id,
		genusId: row.genus_id,
		epithet: row.epithet,
		commonName: row.common_name,
		displayName: row.display_name,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

function toSafeOrganizationSpecies(row: {
	readonly id: string;
	readonly organization_id: string;
	readonly species_id: string;
	readonly created_by_profile_id: string | null;
	readonly updated_by_profile_id: string | null;
	readonly created_at: Date;
	readonly updated_at: Date;
}): SafeOrganizationSpecies {
	return {
		id: row.id,
		organizationId: row.organization_id,
		speciesId: row.species_id,
		createdByProfileId: row.created_by_profile_id,
		updatedByProfileId: row.updated_by_profile_id,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

function toSafeOrgLookup(row: {
	readonly id: string;
	readonly organization_id: string;
	readonly name: string;
	readonly description: string | null;
	readonly custom_schema: unknown | null;
	readonly is_active: boolean;
	readonly created_by_profile_id: string | null;
	readonly updated_by_profile_id: string | null;
	readonly created_at: Date;
	readonly updated_at: Date;
}): SafeOrgLookup {
	return {
		id: row.id,
		organizationId: row.organization_id,
		name: row.name,
		description: row.description,
		customSchema: row.custom_schema,
		isActive: row.is_active,
		createdByProfileId: row.created_by_profile_id,
		updatedByProfileId: row.updated_by_profile_id,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

function toSafeTrap(row: {
	readonly id: string;
	readonly organization_id: string;
	readonly feature_id: string;
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
		featureId: row.feature_id,
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

function normalizeEmail(email: string): string {
	return email.trim().toLowerCase();
}
