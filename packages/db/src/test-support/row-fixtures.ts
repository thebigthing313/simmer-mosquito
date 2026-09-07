import { type InsertObject, sql } from 'kysely';
import type { DbExecutor, SimmerDatabase } from '../index.js';

/**
 * The rows an integration suite has to put in front of the code it is testing.
 *
 * Twenty-one suites across `packages/db` and `apps/server` used to re-derive
 * these. `createOrganization` alone had thirteen byte-identical copies, so a
 * migration adding a NOT NULL column broke them one at a time, in two packages,
 * as a Postgres runtime error rather than a type error. Now it breaks here.
 *
 * Each builder takes the parent ids it cannot invent, fills every other required
 * column with a schema-valid default, and returns the inserted row's id. A suite
 * that needs a different value passes it in `overrides` rather than keeping a
 * second copy of the builder. `overrides` is the table's insert shape, so a
 * renamed column fails `tsc` here instead of reading `undefined` at run time.
 *
 * What does not belong here: a scenario. `seedActivityWorld`,
 * `seedCorpus` and `seedWorld` encode one test's own world rather than the
 * schema, and they stay in the suites that own them. They may call these.
 */

type Overrides<T extends keyof SimmerDatabase & string> = Partial<InsertObject<SimmerDatabase, T>>;

/**
 * A counter behind the defaults for columns the database holds unique.
 *
 * Two Organizations in one test need two `workos_organization_id` values, and
 * neither one is ever read back, so the caller should not have to invent them.
 */
let nextRow = 0;

function unique(prefix: string): string {
	nextRow += 1;
	return `${prefix}_${nextRow}`;
}

/**
 * The point every geometry-bearing fixture sits on, in the Mississippi Delta.
 *
 * One place for all of them is deliberate: a suite that cares about distance
 * passes its own longitude, and every other suite gets rows that are trivially
 * within reach of each other.
 */
const FIXTURE_LNG = -90.5;
const FIXTURE_LAT = 35.5;

/** `ST_SetSRID(ST_MakePoint(...), 4326)`, which is what every geometry column here takes. */
export function fixturePoint(lng = FIXTURE_LNG, lat = FIXTURE_LAT) {
	return sql<string>`st_setsrid(st_makepoint(${lng}, ${lat}), 4326)`;
}

/** A square around {@link FIXTURE_LNG}, for the columns that hold an area. */
function fixturePolygon() {
	return sql<string>`st_setsrid(st_geomfromtext('POLYGON((-90.6 35.4, -90.4 35.4, -90.4 35.6, -90.6 35.6, -90.6 35.4))'), 4326)`;
}

// Identity

export async function createOrganization(
	db: DbExecutor,
	overrides: Overrides<'organizations'> = {},
): Promise<string> {
	const slug = unique('org');
	const row = await db
		.insertInto('organizations')
		.values({
			workos_organization_id: `workos_${slug}`,
			name: `${slug} District`,
			...overrides,
		})
		.returning(['id'])
		.executeTakeFirstOrThrow();
	return row.id;
}

/** The Account half of identity, which only the suites that read a WorkOS id need. */
export async function createUser(
	db: DbExecutor,
	overrides: Overrides<'users'> = {},
): Promise<string> {
	const slug = unique('user');
	const row = await db
		.insertInto('users')
		.values({
			workos_user_id: `workos_${slug}`,
			email: `${slug}@simmer.test`,
			display_name: 'Operator',
			...overrides,
		})
		.returning(['id'])
		.executeTakeFirstOrThrow();
	return row.id;
}

export async function createProfile(
	db: DbExecutor,
	organizationId: string,
	overrides: Overrides<'profiles'> = {},
): Promise<string> {
	const row = await db
		.insertInto('profiles')
		.values({
			organization_id: organizationId,
			display_name: 'Technician',
			...overrides,
		})
		.returning(['id'])
		.executeTakeFirstOrThrow();
	return row.id;
}

// Places and people

export async function createAddress(
	db: DbExecutor,
	organizationId: string,
	overrides: Overrides<'addresses'> = {},
): Promise<string> {
	const row = await db
		.insertInto('addresses')
		.values({
			organization_id: organizationId,
			geom: fixturePoint(),
			display_name: '14 Levee Road',
			country: 'US',
			...overrides,
		})
		.returning(['id'])
		.executeTakeFirstOrThrow();
	return row.id;
}

export async function createContact(
	db: DbExecutor,
	organizationId: string,
	overrides: Overrides<'contacts'> = {},
): Promise<string> {
	const row = await db
		.insertInto('contacts')
		.values({
			organization_id: organizationId,
			contact_name: 'R. Alvarez',
			...overrides,
		})
		.returning(['id'])
		.executeTakeFirstOrThrow();
	return row.id;
}

export async function createRegionFolder(
	db: DbExecutor,
	organizationId: string,
	overrides: Overrides<'region_folders'> = {},
): Promise<string> {
	const row = await db
		.insertInto('region_folders')
		.values({ organization_id: organizationId, name: 'Zones', ...overrides })
		.returning(['id'])
		.executeTakeFirstOrThrow();
	return row.id;
}

export async function createRegion(
	db: DbExecutor,
	organizationId: string,
	overrides: Overrides<'regions'> = {},
): Promise<string> {
	const row = await db
		.insertInto('regions')
		.values({
			organization_id: organizationId,
			geom: fixturePolygon(),
			name: 'Zone 1',
			metadata: null,
			...overrides,
		})
		.returning(['id'])
		.executeTakeFirstOrThrow();
	return row.id;
}

// Larval surveillance

export async function createHabitat(
	db: DbExecutor,
	organizationId: string,
	overrides: Overrides<'habitats'> = {},
): Promise<string> {
	const row = await db
		.insertInto('habitats')
		.values({
			organization_id: organizationId,
			geom: fixturePoint(),
			habitat_name: 'Ditch',
			description: 'Roadside ditch',
			metadata: null,
			...overrides,
		})
		.returning(['id'])
		.executeTakeFirstOrThrow();
	return row.id;
}

export async function createInspection(
	db: DbExecutor,
	organizationId: string,
	overrides: Overrides<'inspections'> = {},
): Promise<string> {
	const row = await db
		.insertInto('inspections')
		.values({
			organization_id: organizationId,
			geom: fixturePoint(),
			inspection_date: sql`date '2026-08-01'`,
			is_wet: true,
			...overrides,
		})
		.returning(['id'])
		.executeTakeFirstOrThrow();
	return row.id;
}

// Adult surveillance

/** `name` is unique per Organization, so a second method in one test needs its own. */
export async function createCollectionMethod(
	db: DbExecutor,
	organizationId: string,
	overrides: Overrides<'collection_methods'> = {},
): Promise<string> {
	const row = await db
		.insertInto('collection_methods')
		.values({ organization_id: organizationId, name: 'CDC light trap', ...overrides })
		.returning(['id'])
		.executeTakeFirstOrThrow();
	return row.id;
}

export async function createTrap(
	db: DbExecutor,
	organizationId: string,
	collectionMethodId: string,
	overrides: Overrides<'traps'> = {},
): Promise<string> {
	const row = await db
		.insertInto('traps')
		.values({
			organization_id: organizationId,
			collection_method_id: collectionMethodId,
			geom: fixturePoint(),
			trap_name: 'North gate',
			...overrides,
		})
		.returning(['id'])
		.executeTakeFirstOrThrow();
	return row.id;
}

/**
 * A collection on the exact-timestamp clock.
 *
 * `collections_timing_shape` refuses a row that names neither clock, so
 * `started_at` is part of the default rather than something a caller remembers.
 */
export async function createCollection(
	db: DbExecutor,
	organizationId: string,
	links: { readonly trapId: string; readonly collectionMethodId: string },
	overrides: Overrides<'collections'> = {},
): Promise<string> {
	const row = await db
		.insertInto('collections')
		.values({
			organization_id: organizationId,
			trap_id: links.trapId,
			collection_method_id: links.collectionMethodId,
			geom: fixturePoint(),
			collection_timing_mode: 'exact_timestamps',
			started_at: sql`timestamptz '2026-08-01 06:00:00+00'`,
			metadata: null,
			...overrides,
		})
		.returning(['id'])
		.executeTakeFirstOrThrow();
	return row.id;
}

/** A genus and one species under it, because `species.genus_id` has nothing to point at otherwise. */
export async function createSpecies(
	db: DbExecutor,
	overrides: Overrides<'species'> = {},
): Promise<string> {
	const genus = await db
		.insertInto('genera')
		.values({ abbreviation: 'Cx', name: 'Culex' })
		.returning(['id'])
		.executeTakeFirstOrThrow();
	const row = await db
		.insertInto('species')
		.values({
			genus_id: genus.id,
			epithet: 'pipiens',
			display_name: 'Culex pipiens',
			...overrides,
		})
		.returning(['id'])
		.executeTakeFirstOrThrow();
	return row.id;
}

export async function createOrganizationSpecies(
	db: DbExecutor,
	organizationId: string,
	speciesId: string,
	overrides: Overrides<'organization_species'> = {},
): Promise<string> {
	const row = await db
		.insertInto('organization_species')
		.values({ organization_id: organizationId, species_id: speciesId, ...overrides })
		.returning(['id'])
		.executeTakeFirstOrThrow();
	return row.id;
}

export async function createCollectionSpecies(
	db: DbExecutor,
	organizationId: string,
	links: { readonly collectionId: string; readonly speciesId: string },
	overrides: Overrides<'collection_species'> = {},
): Promise<string> {
	const row = await db
		.insertInto('collection_species')
		.values({
			organization_id: organizationId,
			collection_id: links.collectionId,
			species_id: links.speciesId,
			count: 12,
			identified_date: sql`date '2026-08-02'`,
			...overrides,
		})
		.returning(['id'])
		.executeTakeFirstOrThrow();
	return row.id;
}

// Catalogs

/** `code` is unique across every Organization, so the default carries a counter. */
export async function createUnit(
	db: DbExecutor,
	overrides: Overrides<'units'> = {},
): Promise<string> {
	const row = await db
		.insertInto('units')
		.values({
			code: unique('test_unit'),
			unit_name: 'units',
			abbreviation: 'u',
			unit_type: 'count',
			unit_system: 'si',
			...overrides,
		})
		.returning(['id'])
		.executeTakeFirstOrThrow();
	return row.id;
}

export async function createSourceReductionMethod(
	db: DbExecutor,
	organizationId: string,
	overrides: Overrides<'source_reduction_methods'> = {},
): Promise<string> {
	const row = await db
		.insertInto('source_reduction_methods')
		.values({ organization_id: organizationId, name: 'Ditch clearing', ...overrides })
		.returning(['id'])
		.executeTakeFirstOrThrow();
	return row.id;
}

export async function createInsecticide(
	db: DbExecutor,
	organizationId: string,
	defaultUnitId: string,
	overrides: Overrides<'insecticides'> = {},
): Promise<string> {
	const row = await db
		.insertInto('insecticides')
		.values({
			organization_id: organizationId,
			trade_name: 'Larvicide A',
			active_ingredient: 'Bti',
			type: 'larvicide',
			registration_number: '12345-67',
			default_unit_id: defaultUnitId,
			...overrides,
		})
		.returning(['id'])
		.executeTakeFirstOrThrow();
	return row.id;
}

// Field work

export async function createRoute(
	db: DbExecutor,
	organizationId: string,
	overrides: Overrides<'routes'> = {},
): Promise<string> {
	const row = await db
		.insertInto('routes')
		.values({
			organization_id: organizationId,
			route_name: 'West larval run',
			route_type: 'habitat',
			...overrides,
		})
		.returning(['id'])
		.executeTakeFirstOrThrow();
	return row.id;
}

export async function createRouteItem(
	db: DbExecutor,
	organizationId: string,
	links: { readonly routeId: string; readonly entityType: string; readonly entityId: string },
	overrides: Overrides<'route_items'> = {},
): Promise<string> {
	const row = await db
		.insertInto('route_items')
		.values({
			organization_id: organizationId,
			route_id: links.routeId,
			entity_type: links.entityType,
			entity_id: links.entityId,
			position: 1,
			...overrides,
		})
		.returning(['id'])
		.executeTakeFirstOrThrow();
	return row.id;
}

export async function createAssignment(
	db: DbExecutor,
	organizationId: string,
	overrides: Overrides<'assignments'> = {},
): Promise<string> {
	const row = await db
		.insertInto('assignments')
		.values({
			organization_id: organizationId,
			assignment_name: 'Thursday larval run',
			assignment_date: sql`date '2026-08-05'`,
			...overrides,
		})
		.returning(['id'])
		.executeTakeFirstOrThrow();
	return row.id;
}

/**
 * A stop on an assignment.
 *
 * `assignment_items_assignment_entity_unique` means one assignment cannot visit
 * the same record twice, so two stops in one test need two entity ids.
 */
export async function createAssignmentItem(
	db: DbExecutor,
	organizationId: string,
	links: { readonly assignmentId: string; readonly entityType: string; readonly entityId: string },
	overrides: Overrides<'assignment_items'> = {},
): Promise<string> {
	const row = await db
		.insertInto('assignment_items')
		.values({
			organization_id: organizationId,
			assignment_id: links.assignmentId,
			entity_type: links.entityType,
			entity_id: links.entityId,
			position: 1,
			...overrides,
		})
		.returning(['id'])
		.executeTakeFirstOrThrow();
	return row.id;
}

// Mission dispatch

/**
 * A request for control work.
 *
 * `control_type` decides which action table can answer it, so a suite testing
 * source reduction passes its own rather than taking the default.
 */
export async function createRequestedControlAction(
	db: DbExecutor,
	organizationId: string,
	overrides: Overrides<'requested_control_actions'> = {},
): Promise<string> {
	const row = await db
		.insertInto('requested_control_actions')
		.values({
			organization_id: organizationId,
			control_type: 'application',
			geom: fixturePoint(),
			summary: 'Standing water behind the levee.',
			...overrides,
		})
		.returning(['id'])
		.executeTakeFirstOrThrow();
	return row.id;
}

export async function createMission(
	db: DbExecutor,
	organizationId: string,
	overrides: Overrides<'missions'> = {},
): Promise<string> {
	const row = await db
		.insertInto('missions')
		.values({
			organization_id: organizationId,
			control_type: 'application',
			scheduled_start_at: sql`timestamptz '2026-08-05 06:00:00+00'`,
			...overrides,
		})
		.returning(['id'])
		.executeTakeFirstOrThrow();
	return row.id;
}

export async function createMissionItem(
	db: DbExecutor,
	organizationId: string,
	missionId: string,
	overrides: Overrides<'mission_items'> = {},
): Promise<string> {
	const row = await db
		.insertInto('mission_items')
		.values({
			organization_id: organizationId,
			mission_id: missionId,
			geom: fixturePoint(),
			position: 1,
			...overrides,
		})
		.returning(['id'])
		.executeTakeFirstOrThrow();
	return row.id;
}

// Public engagement

export async function createNotificationType(
	db: DbExecutor,
	organizationId: string,
	overrides: Overrides<'notification_types'> = {},
): Promise<string> {
	const row = await db
		.insertInto('notification_types')
		.values({ organization_id: organizationId, name: 'Adulticiding', ...overrides })
		.returning(['id'])
		.executeTakeFirstOrThrow();
	return row.id;
}

export async function createNotificationRegistration(
	db: DbExecutor,
	organizationId: string,
	contactId: string,
	overrides: Overrides<'notification_registrations'> = {},
): Promise<string> {
	const row = await db
		.insertInto('notification_registrations')
		.values({
			organization_id: organizationId,
			contact_id: contactId,
			geom: fixturePoint(),
			...overrides,
		})
		.returning(['id'])
		.executeTakeFirstOrThrow();
	return row.id;
}

/** A request from the public, which needs both an address and a contact to point at. */
export async function createServiceRequest(
	db: DbExecutor,
	organizationId: string,
	links: { readonly addressId: string; readonly contactId: string },
	overrides: Overrides<'service_requests'> = {},
): Promise<string> {
	const row = await db
		.insertInto('service_requests')
		.values({
			organization_id: organizationId,
			address_id: links.addressId,
			contact_id: links.contactId,
			geom: fixturePoint(),
			request_date: sql`date '2026-08-01'`,
			intake_type: 'phone',
			details: 'Standing water behind the levee.',
			metadata: null,
			...overrides,
		})
		.returning(['id'])
		.executeTakeFirstOrThrow();
	return row.id;
}

// Shared across domains

export async function createTag(
	db: DbExecutor,
	organizationId: string,
	overrides: Overrides<'tags'> = {},
): Promise<string> {
	const row = await db
		.insertInto('tags')
		.values({ organization_id: organizationId, tag_name: 'Standing water', ...overrides })
		.returning(['id'])
		.executeTakeFirstOrThrow();
	return row.id;
}

export async function createTagItem(
	db: DbExecutor,
	organizationId: string,
	links: { readonly tagId: string; readonly entityType: string; readonly entityId: string },
	overrides: Overrides<'tag_items'> = {},
): Promise<string> {
	const row = await db
		.insertInto('tag_items')
		.values({
			organization_id: organizationId,
			tag_id: links.tagId,
			entity_type: links.entityType,
			entity_id: links.entityId,
			...overrides,
		})
		.returning(['id'])
		.executeTakeFirstOrThrow();
	return row.id;
}

export async function createComment(
	db: DbExecutor,
	organizationId: string,
	links: { readonly entityType: string; readonly entityId: string },
	overrides: Overrides<'comments'> = {},
): Promise<string> {
	const row = await db
		.insertInto('comments')
		.values({
			organization_id: organizationId,
			entity_type: links.entityType,
			entity_id: links.entityId,
			comment_text: 'Note',
			...overrides,
		})
		.returning(['id'])
		.executeTakeFirstOrThrow();
	return row.id;
}
