import { type Kysely, sql, type Transaction } from 'kysely';
import type { RouteType, SimmerDatabase, UnitSystem, UnitType } from '../index.js';

type DbExecutor = Kysely<SimmerDatabase> | Transaction<SimmerDatabase>;

export const SYNC_BASELINE_ORGANIZATION_ID = '00000000-0000-4000-8000-000000000101';

export const syncBaselineProfiles = [
	{
		id: '00000000-0000-4000-8000-000000001001',
		displayName: 'Sam Sync Owner',
		email: 'sam.owner.sync@example.test',
		isActive: true,
	},
	{
		id: '00000000-0000-4000-8000-000000001002',
		displayName: 'Riley Field Collector',
		email: 'riley.collector.sync@example.test',
		isActive: true,
	},
	{
		id: '00000000-0000-4000-8000-000000001003',
		displayName: 'Taylor Historical Technician',
		email: 'taylor.historical.sync@example.test',
		isActive: false,
	},
] as const;

export const syncBaselineUnits = [
	{
		id: '00000000-0000-4000-8000-000000002001',
		code: 'count',
		unitName: 'Count',
		abbreviation: 'ct',
		unitType: 'count',
		unitSystem: 'si',
	},
	{
		id: '00000000-0000-4000-8000-000000002002',
		code: 'minute',
		unitName: 'Minute',
		abbreviation: 'min',
		unitType: 'duration',
		unitSystem: 'si',
	},
	{
		id: '00000000-0000-4000-8000-000000002003',
		code: 'hour',
		unitName: 'Hour',
		abbreviation: 'hr',
		unitType: 'duration',
		unitSystem: 'si',
	},
	{
		id: '00000000-0000-4000-8000-000000002004',
		code: 'acre',
		unitName: 'Acre',
		abbreviation: 'ac',
		unitType: 'area',
		unitSystem: 'imperial',
	},
	{
		id: '00000000-0000-4000-8000-000000002005',
		code: 'gallon',
		unitName: 'Gallon',
		abbreviation: 'gal',
		unitType: 'volume',
		unitSystem: 'us_customary',
	},
	{
		id: '00000000-0000-4000-8000-000000002006',
		code: 'fluid_ounce_us',
		unitName: 'Fluid ounce',
		abbreviation: 'fl oz',
		unitType: 'volume',
		unitSystem: 'us_customary',
	},
	{
		id: '00000000-0000-4000-8000-000000002007',
		code: 'pound',
		unitName: 'Pound',
		abbreviation: 'lb',
		unitType: 'weight',
		unitSystem: 'imperial',
	},
	{
		id: '00000000-0000-4000-8000-000000002008',
		code: 'mile',
		unitName: 'Mile',
		abbreviation: 'mi',
		unitType: 'distance',
		unitSystem: 'imperial',
	},
	{
		id: '00000000-0000-4000-8000-000000002009',
		code: 'fahrenheit',
		unitName: 'Fahrenheit',
		abbreviation: 'F',
		unitType: 'temperature',
		unitSystem: 'us_customary',
	},
	{
		id: '00000000-0000-4000-8000-000000002010',
		code: 'miles_per_hour',
		unitName: 'Miles per hour',
		abbreviation: 'mph',
		unitType: 'speed',
		unitSystem: 'imperial',
	},
] as const satisfies ReadonlyArray<{
	readonly id: string;
	readonly code: string;
	readonly unitName: string;
	readonly abbreviation: string;
	readonly unitType: UnitType;
	readonly unitSystem: UnitSystem;
}>;

export const syncBaselineGenera = [
	{
		id: '00000000-0000-4000-8000-000000003001',
		abbreviation: 'Ae.',
		name: 'Aedes',
	},
	{
		id: '00000000-0000-4000-8000-000000003002',
		abbreviation: 'Cx.',
		name: 'Culex',
	},
	{
		id: '00000000-0000-4000-8000-000000003003',
		abbreviation: 'An.',
		name: 'Anopheles',
	},
] as const;

export const syncBaselineSpecies = [
	{
		id: '00000000-0000-4000-8000-000000004001',
		genusId: '00000000-0000-4000-8000-000000003001',
		epithet: 'aegypti',
		commonName: 'Yellow fever mosquito',
		displayName: 'Aedes aegypti',
		selectedForOrganization: true,
	},
	{
		id: '00000000-0000-4000-8000-000000004002',
		genusId: '00000000-0000-4000-8000-000000003001',
		epithet: 'albopictus',
		commonName: 'Asian tiger mosquito',
		displayName: 'Aedes albopictus',
		selectedForOrganization: true,
	},
	{
		id: '00000000-0000-4000-8000-000000004003',
		genusId: '00000000-0000-4000-8000-000000003002',
		epithet: 'pipiens',
		commonName: 'Northern house mosquito',
		displayName: 'Culex pipiens',
		selectedForOrganization: true,
	},
	{
		id: '00000000-0000-4000-8000-000000004004',
		genusId: '00000000-0000-4000-8000-000000003002',
		epithet: 'quinquefasciatus',
		commonName: 'Southern house mosquito',
		displayName: 'Culex quinquefasciatus',
		selectedForOrganization: true,
	},
	{
		id: '00000000-0000-4000-8000-000000004005',
		genusId: '00000000-0000-4000-8000-000000003003',
		epithet: 'punctipennis',
		commonName: 'Woodland malaria mosquito',
		displayName: 'Anopheles punctipennis',
		selectedForOrganization: false,
	},
	{
		id: '00000000-0000-4000-8000-000000004006',
		genusId: null,
		epithet: 'unidentified',
		commonName: null,
		displayName: 'Unidentified mosquito',
		selectedForOrganization: true,
	},
] as const;

export const syncBaselineCollectionMethods = [
	{
		id: '00000000-0000-4000-8000-000000005001',
		name: 'CDC Light Trap',
		description: 'Routine adult mosquito light trap collection.',
		actionThreshold: 25,
		isActive: true,
	},
	{
		id: '00000000-0000-4000-8000-000000005002',
		name: 'Gravid Trap',
		description: 'Adult mosquito gravid trap collection.',
		actionThreshold: 10,
		isActive: true,
	},
	{
		id: '00000000-0000-4000-8000-000000005003',
		name: 'Legacy Aspirator',
		description: 'Inactive historical adult collection method kept for display.',
		actionThreshold: null,
		isActive: false,
	},
] as const;

export const syncBaselineCollectionLures = [
	{
		id: '00000000-0000-4000-8000-000000006001',
		name: 'CO2',
		description: 'Dry ice or bottled carbon dioxide attractant.',
		isActive: true,
	},
	{
		id: '00000000-0000-4000-8000-000000006002',
		name: 'BG-Lure',
		description: 'Synthetic human-scent lure.',
		isActive: true,
	},
	{
		id: '00000000-0000-4000-8000-000000006003',
		name: 'Octenol',
		description: 'Inactive historical lure retained for older trap records.',
		isActive: false,
	},
] as const;

export const syncBaselineHabitatTypes = [
	{
		id: '00000000-0000-4000-8000-000000007001',
		name: 'Catch Basin',
		description: 'Storm drain or catch basin habitat.',
		isActive: true,
	},
	{
		id: '00000000-0000-4000-8000-000000007002',
		name: 'Container',
		description: 'Artificial container habitat.',
		isActive: true,
	},
	{
		id: '00000000-0000-4000-8000-000000007003',
		name: 'Tire Pile',
		description: 'Inactive historical habitat type retained for display.',
		isActive: false,
	},
] as const;

export const syncBaselineTags = [
	{
		id: '00000000-0000-4000-8000-000000008001',
		tagName: 'High Priority',
		description: 'Needs review before the next field cycle.',
		color: '#DC2626',
		isActive: true,
	},
	{
		id: '00000000-0000-4000-8000-000000008002',
		tagName: 'School Zone',
		description: 'Near a school or youth facility.',
		color: '#2563EB',
		isActive: true,
	},
	{
		id: '00000000-0000-4000-8000-000000008003',
		tagName: 'Legacy District',
		description: 'Inactive historical tag retained for older assignments.',
		color: '#6B7280',
		isActive: false,
	},
] as const;

export const syncBaselineRoutes = [
	{
		id: '00000000-0000-4000-8000-000000009001',
		routeName: 'North Larval Loop',
		routeType: 'habitat',
	},
	{
		id: '00000000-0000-4000-8000-000000009002',
		routeName: 'Downtown Adult Trap Run',
		routeType: 'trap',
	},
] as const satisfies ReadonlyArray<{
	readonly id: string;
	readonly routeName: string;
	readonly routeType: RouteType;
}>;

export interface SeedSyncBaselineOptions {
	readonly organizationId?: string;
}

export interface SeedSyncBaselineResult {
	readonly organizationId: string;
	readonly profileCount: number;
	readonly unitCount: number;
	readonly genusCount: number;
	readonly speciesCount: number;
	readonly organizationSpeciesCount: number;
	readonly collectionMethodCount: number;
	readonly collectionLureCount: number;
	readonly habitatTypeCount: number;
	readonly tagCount: number;
	readonly routeCount: number;
}

type WithDynamicId<T extends { readonly id: string }> = Omit<T, 'id'> & {
	readonly id: string;
};

export interface SyncBaselineFixture {
	readonly profiles: ReadonlyArray<WithDynamicId<(typeof syncBaselineProfiles)[number]>>;
	readonly organizationSpecies: ReadonlyArray<{
		readonly id: string;
		readonly speciesId: string;
	}>;
	readonly collectionMethods: ReadonlyArray<
		WithDynamicId<(typeof syncBaselineCollectionMethods)[number]>
	>;
	readonly collectionLures: ReadonlyArray<
		WithDynamicId<(typeof syncBaselineCollectionLures)[number]>
	>;
	readonly habitatTypes: ReadonlyArray<WithDynamicId<(typeof syncBaselineHabitatTypes)[number]>>;
	readonly tags: ReadonlyArray<WithDynamicId<(typeof syncBaselineTags)[number]>>;
	readonly routes: ReadonlyArray<WithDynamicId<(typeof syncBaselineRoutes)[number]>>;
}

export function createSyncBaselineFixture(organizationId: string): SyncBaselineFixture {
	return {
		profiles: syncBaselineProfiles.map((profile, index) => ({
			...profile,
			id: organizationScopedId(organizationId, 1, index + 1),
		})),
		organizationSpecies: syncBaselineSpecies
			.filter((species) => species.selectedForOrganization)
			.map((species, index) => ({
				id: organizationScopedId(organizationId, 14, index + 1),
				speciesId: species.id,
			})),
		collectionMethods: syncBaselineCollectionMethods.map((method, index) => ({
			...method,
			id: organizationScopedId(organizationId, 5, index + 1),
		})),
		collectionLures: syncBaselineCollectionLures.map((lure, index) => ({
			...lure,
			id: organizationScopedId(organizationId, 6, index + 1),
		})),
		habitatTypes: syncBaselineHabitatTypes.map((habitatType, index) => ({
			...habitatType,
			id: organizationScopedId(organizationId, 7, index + 1),
		})),
		tags: syncBaselineTags.map((tag, index) => ({
			...tag,
			id: organizationScopedId(organizationId, 8, index + 1),
		})),
		routes: syncBaselineRoutes.map((route, index) => ({
			...route,
			id: organizationScopedId(organizationId, 9, index + 1),
		})),
	};
}

export async function seedSyncBaseline(
	db: Kysely<SimmerDatabase>,
	options: SeedSyncBaselineOptions = {},
): Promise<SeedSyncBaselineResult> {
	const organizationId = options.organizationId ?? SYNC_BASELINE_ORGANIZATION_ID;
	const fixture = createSyncBaselineFixture(organizationId);

	await db.transaction().execute(async (trx) => {
		await upsertOrganization(trx, organizationId);
		await upsertProfiles(trx, organizationId, fixture);
		await upsertUnits(trx);
		await upsertGenera(trx);
		await upsertSpecies(trx);
		await upsertOrganizationSpecies(trx, organizationId, fixture);
		await upsertCollectionMethods(trx, organizationId, fixture);
		await upsertCollectionLures(trx, organizationId, fixture);
		await upsertHabitatTypes(trx, organizationId, fixture);
		await upsertTags(trx, organizationId, fixture);
		await upsertRoutes(trx, organizationId, fixture);
	});

	return {
		organizationId,
		profileCount: fixture.profiles.length,
		unitCount: syncBaselineUnits.length,
		genusCount: syncBaselineGenera.length,
		speciesCount: syncBaselineSpecies.length,
		organizationSpeciesCount: fixture.organizationSpecies.length,
		collectionMethodCount: fixture.collectionMethods.length,
		collectionLureCount: fixture.collectionLures.length,
		habitatTypeCount: fixture.habitatTypes.length,
		tagCount: fixture.tags.length,
		routeCount: fixture.routes.length,
	};
}

async function upsertOrganization(db: DbExecutor, organizationId: string): Promise<void> {
	const orgSuffix = organizationId.replaceAll('-', '').slice(-12);

	await db
		.insertInto('organizations')
		.values({
			id: organizationId,
			workos_organization_id: `org_sync_baseline_${orgSuffix}`,
			name: 'Sync Baseline Mosquito District',
			slug: `sync-baseline-${orgSuffix}`,
			settings: {
				timezone: 'America/New_York',
				larvalInspectionEntryPolicy: 'sample_required_for_positive',
			},
			subscription_status: 'trial',
			billing_mode: 'manual_invoice',
			main_contact_email: 'sync-baseline@example.test',
			phone_number: '555-0100',
			mailing_country: 'US',
			mailing_address_line_1: '100 Vector Way',
			mailing_locality: 'Sample City',
			mailing_region: 'FL',
			mailing_postal_code: '32004',
			updated_by_profile_id: null,
			deleted_at: null,
			deleted_by_profile_id: null,
		})
		.onConflict((oc) =>
			oc.column('id').doUpdateSet({
				name: 'Sync Baseline Mosquito District',
				slug: `sync-baseline-${orgSuffix}`,
				settings: {
					timezone: 'America/New_York',
					larvalInspectionEntryPolicy: 'sample_required_for_positive',
				},
				subscription_status: 'trial',
				billing_mode: 'manual_invoice',
				main_contact_email: 'sync-baseline@example.test',
				phone_number: '555-0100',
				mailing_country: 'US',
				mailing_address_line_1: '100 Vector Way',
				mailing_locality: 'Sample City',
				mailing_region: 'FL',
				mailing_postal_code: '32004',
				updated_at: sql`now()`,
				deleted_at: null,
				deleted_by_profile_id: null,
			}),
		)
		.execute();
}

async function upsertProfiles(
	db: DbExecutor,
	organizationId: string,
	fixture: SyncBaselineFixture,
): Promise<void> {
	for (const profile of fixture.profiles) {
		await db
			.insertInto('profiles')
			.values({
				id: profile.id,
				organization_id: organizationId,
				user_id: null,
				display_name: profile.displayName,
				email: profile.email,
				is_active: profile.isActive,
				deleted_at: null,
				deleted_by_profile_id: null,
			})
			.onConflict((oc) =>
				oc.column('id').doUpdateSet({
					organization_id: organizationId,
					user_id: null,
					display_name: profile.displayName,
					email: profile.email,
					is_active: profile.isActive,
					updated_at: sql`now()`,
					deleted_at: null,
					deleted_by_profile_id: null,
				}),
			)
			.execute();
	}
}

async function upsertUnits(db: DbExecutor): Promise<void> {
	for (const unit of syncBaselineUnits) {
		await db
			.insertInto('units')
			.values({
				id: unit.id,
				code: unit.code,
				unit_name: unit.unitName,
				abbreviation: unit.abbreviation,
				unit_type: unit.unitType,
				unit_system: unit.unitSystem,
			})
			.onConflict((oc) =>
				oc.column('id').doUpdateSet({
					code: unit.code,
					unit_name: unit.unitName,
					abbreviation: unit.abbreviation,
					unit_type: unit.unitType,
					unit_system: unit.unitSystem,
				}),
			)
			.execute();
	}
}

async function upsertGenera(db: DbExecutor): Promise<void> {
	for (const genus of syncBaselineGenera) {
		await db
			.insertInto('genera')
			.values({
				id: genus.id,
				abbreviation: genus.abbreviation,
				name: genus.name,
			})
			.onConflict((oc) =>
				oc.column('id').doUpdateSet({
					abbreviation: genus.abbreviation,
					name: genus.name,
					updated_at: sql`now()`,
				}),
			)
			.execute();
	}
}

async function upsertSpecies(db: DbExecutor): Promise<void> {
	for (const species of syncBaselineSpecies) {
		await db
			.insertInto('species')
			.values({
				id: species.id,
				genus_id: species.genusId,
				epithet: species.epithet,
				common_name: species.commonName,
				display_name: species.displayName,
			})
			.onConflict((oc) =>
				oc.column('id').doUpdateSet({
					genus_id: species.genusId,
					epithet: species.epithet,
					common_name: species.commonName,
					display_name: species.displayName,
					updated_at: sql`now()`,
				}),
			)
			.execute();
	}
}

async function upsertOrganizationSpecies(
	db: DbExecutor,
	organizationId: string,
	fixture: SyncBaselineFixture,
): Promise<void> {
	for (const organizationSpecies of fixture.organizationSpecies) {
		await db
			.insertInto('organization_species')
			.values({
				id: organizationSpecies.id,
				organization_id: organizationId,
				species_id: organizationSpecies.speciesId,
				created_by_profile_id: seedActorProfileId(fixture),
				updated_by_profile_id: seedActorProfileId(fixture),
				deleted_at: null,
				deleted_by_profile_id: null,
			})
			.onConflict((oc) =>
				oc.column('id').doUpdateSet({
					organization_id: organizationId,
					species_id: organizationSpecies.speciesId,
					updated_by_profile_id: seedActorProfileId(fixture),
					updated_at: sql`now()`,
					deleted_at: null,
					deleted_by_profile_id: null,
				}),
			)
			.execute();
	}
}

async function upsertCollectionMethods(
	db: DbExecutor,
	organizationId: string,
	fixture: SyncBaselineFixture,
): Promise<void> {
	for (const method of fixture.collectionMethods) {
		await db
			.insertInto('collection_methods')
			.values({
				id: method.id,
				organization_id: organizationId,
				name: method.name,
				description: method.description,
				custom_schema: null,
				action_threshold: method.actionThreshold,
				is_active: method.isActive,
				created_by_profile_id: seedActorProfileId(fixture),
				updated_by_profile_id: seedActorProfileId(fixture),
				deleted_at: null,
				deleted_by_profile_id: null,
			})
			.onConflict((oc) =>
				oc.column('id').doUpdateSet({
					organization_id: organizationId,
					name: method.name,
					description: method.description,
					custom_schema: null,
					action_threshold: method.actionThreshold,
					is_active: method.isActive,
					updated_by_profile_id: seedActorProfileId(fixture),
					updated_at: sql`now()`,
					deleted_at: null,
					deleted_by_profile_id: null,
				}),
			)
			.execute();
	}
}

async function upsertCollectionLures(
	db: DbExecutor,
	organizationId: string,
	fixture: SyncBaselineFixture,
): Promise<void> {
	for (const lure of fixture.collectionLures) {
		await db
			.insertInto('collection_lures')
			.values({
				id: lure.id,
				organization_id: organizationId,
				name: lure.name,
				description: lure.description,
				is_active: lure.isActive,
				created_by_profile_id: seedActorProfileId(fixture),
				updated_by_profile_id: seedActorProfileId(fixture),
				deleted_at: null,
				deleted_by_profile_id: null,
			})
			.onConflict((oc) =>
				oc.column('id').doUpdateSet({
					organization_id: organizationId,
					name: lure.name,
					description: lure.description,
					is_active: lure.isActive,
					updated_by_profile_id: seedActorProfileId(fixture),
					updated_at: sql`now()`,
					deleted_at: null,
					deleted_by_profile_id: null,
				}),
			)
			.execute();
	}
}

async function upsertHabitatTypes(
	db: DbExecutor,
	organizationId: string,
	fixture: SyncBaselineFixture,
): Promise<void> {
	for (const habitatType of fixture.habitatTypes) {
		await db
			.insertInto('habitat_types')
			.values({
				id: habitatType.id,
				organization_id: organizationId,
				name: habitatType.name,
				description: habitatType.description,
				custom_schema: null,
				is_active: habitatType.isActive,
				created_by_profile_id: seedActorProfileId(fixture),
				updated_by_profile_id: seedActorProfileId(fixture),
				deleted_at: null,
				deleted_by_profile_id: null,
			})
			.onConflict((oc) =>
				oc.column('id').doUpdateSet({
					organization_id: organizationId,
					name: habitatType.name,
					description: habitatType.description,
					custom_schema: null,
					is_active: habitatType.isActive,
					updated_by_profile_id: seedActorProfileId(fixture),
					updated_at: sql`now()`,
					deleted_at: null,
					deleted_by_profile_id: null,
				}),
			)
			.execute();
	}
}

async function upsertTags(
	db: DbExecutor,
	organizationId: string,
	fixture: SyncBaselineFixture,
): Promise<void> {
	for (const tag of fixture.tags) {
		await db
			.insertInto('tags')
			.values({
				id: tag.id,
				organization_id: organizationId,
				tag_name: tag.tagName,
				description: tag.description,
				color: tag.color,
				is_active: tag.isActive,
				created_by_profile_id: seedActorProfileId(fixture),
				updated_by_profile_id: seedActorProfileId(fixture),
				deleted_at: null,
				deleted_by_profile_id: null,
			})
			.onConflict((oc) =>
				oc.column('id').doUpdateSet({
					organization_id: organizationId,
					tag_name: tag.tagName,
					description: tag.description,
					color: tag.color,
					is_active: tag.isActive,
					updated_by_profile_id: seedActorProfileId(fixture),
					updated_at: sql`now()`,
					deleted_at: null,
					deleted_by_profile_id: null,
				}),
			)
			.execute();
	}
}

async function upsertRoutes(
	db: DbExecutor,
	organizationId: string,
	fixture: SyncBaselineFixture,
): Promise<void> {
	for (const route of fixture.routes) {
		await db
			.insertInto('routes')
			.values({
				id: route.id,
				organization_id: organizationId,
				route_name: route.routeName,
				route_type: route.routeType,
				created_by_profile_id: seedActorProfileId(fixture),
				updated_by_profile_id: seedActorProfileId(fixture),
				deleted_at: null,
				deleted_by_profile_id: null,
			})
			.onConflict((oc) =>
				oc.column('id').doUpdateSet({
					organization_id: organizationId,
					route_name: route.routeName,
					route_type: route.routeType,
					updated_by_profile_id: seedActorProfileId(fixture),
					updated_at: sql`now()`,
					deleted_at: null,
					deleted_by_profile_id: null,
				}),
			)
			.execute();
	}
}

function seedActorProfileId(fixture: SyncBaselineFixture): string {
	const profile = fixture.profiles[0];

	if (profile === undefined) {
		throw new Error('Sync baseline seed fixture requires at least one profile.');
	}

	return profile.id;
}

function organizationScopedId(organizationId: string, bucket: number, row: number): string {
	const organizationHex = organizationId.replaceAll('-', '').toLowerCase();
	const suffix = /^[0-9a-f]{32}$/.test(organizationHex)
		? organizationHex.slice(-12)
		: '000000000101';
	const bucketHex = bucket.toString(16).padStart(3, '0');
	const rowHex = row.toString(16).padStart(3, '0');

	return `00000000-0000-4${bucketHex}-8${rowHex}-${suffix}`;
}
