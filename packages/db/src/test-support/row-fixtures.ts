import { type InsertObject, sql } from 'kysely';
import type { DbExecutor, SimmerDatabase } from '../index.js';

/**
 * The rows an integration suite has to put in front of the code it is testing.
 *
 * The twenty-one integration suites across `packages/db` and `apps/server` used
 * to re-derive these, 147 builders between them under 66 names, 27 of those
 * names in more than one file. `createOrganization` alone had thirteen
 * byte-identical copies, so a migration adding a NOT NULL column broke them one
 * at a time, in two packages, as a Postgres runtime error rather than a type
 * error. Now it breaks here.
 *
 * Each builder takes the parent ids it cannot invent, fills every other required
 * column with a schema-valid default, and returns the inserted row's id. A suite
 * that needs a different value passes it in `overrides` rather than keeping a
 * second copy of the builder. `overrides` is the table's insert shape, so a
 * renamed column fails `tsc` here instead of reading `undefined` at run time.
 *
 * What does not belong here: a scenario. `seedActivityWorld` in
 * `profile-activity`, `seedCorpus` in `domains/region-membership`, `seedWorld`
 * in `domains/mission-notification-generation` and `seed` in `apps/server`'s
 * `region-membership` encode one test's own world rather than the schema, so
 * they stay in the suites that own them. They may call these, and all four do.
 * The ones that write their map as bulk inserts against ids they assert on keep
 * that shape for the rest of their tables and take the Organization from here,
 * because two Organizations are two rows either way.
 */

/**
 * What a caller may say about a row the builder is otherwise filling in.
 *
 * `Fixed` is the columns the builder takes as arguments of its own. They come
 * off, because `overrides` is spread last: a `createHabitat(db, org, {
 * organization_id: theirs })` would quietly win over the id beside it, and an
 * organization-scope case seeded that way tests nothing. Now it fails `tsc`.
 */
type Overrides<
	T extends keyof SimmerDatabase & string,
	Fixed extends keyof InsertObject<SimmerDatabase, T> = never,
> = Partial<Omit<InsertObject<SimmerDatabase, T>, Fixed>>;

/**
 * A counter behind the defaults for columns the database holds unique.
 *
 * Two Organizations in one test need two `workos_organization_id` values, and
 * neither one is ever read back, so the caller should not have to invent them.
 */
let nextUnique = 0;

function unique(prefix: string): string {
	nextUnique += 1;
	return `${prefix}_${nextUnique}`;
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

/**
 * Insert one row and hand back its id, which is what every builder here does.
 *
 * The generic is what keeps the values object checked against the table it is
 * going into, so a column that does not exist fails at the builder rather than
 * being dropped on the way to Postgres.
 */
async function insertRow<T extends keyof SimmerDatabase & string>(
	db: DbExecutor,
	table: T,
	values: InsertObject<SimmerDatabase, T>,
): Promise<string> {
	const row = await db.insertInto(table).values(values).returning(['id']).executeTakeFirstOrThrow();
	return row.id;
}

// Identity

export function createOrganization(
	db: DbExecutor,
	overrides: Overrides<'organizations'> = {},
): Promise<string> {
	const slug = unique('org');
	return insertRow(db, 'organizations', {
		workos_organization_id: `workos_${slug}`,
		name: `${slug} District`,
		...overrides,
	});
}

/** The Account half of identity, which only the suites that read a WorkOS id need. */
export function createUser(db: DbExecutor, overrides: Overrides<'users'> = {}): Promise<string> {
	const slug = unique('user');
	return insertRow(db, 'users', {
		workos_user_id: `workos_${slug}`,
		email: `${slug}@simmer.test`,
		display_name: 'Operator',
		...overrides,
	});
}

export function createProfile(
	db: DbExecutor,
	organizationId: string,
	overrides: Overrides<'profiles', 'organization_id'> = {},
): Promise<string> {
	return insertRow(db, 'profiles', {
		organization_id: organizationId,
		display_name: 'Technician',
		...overrides,
	});
}

// Places and people

export function createAddress(
	db: DbExecutor,
	organizationId: string,
	overrides: Overrides<'addresses', 'organization_id'> = {},
): Promise<string> {
	return insertRow(db, 'addresses', {
		organization_id: organizationId,
		geom: fixturePoint(),
		display_name: '14 Levee Road',
		country: 'US',
		...overrides,
	});
}

export function createContact(
	db: DbExecutor,
	organizationId: string,
	overrides: Overrides<'contacts', 'organization_id'> = {},
): Promise<string> {
	return insertRow(db, 'contacts', {
		organization_id: organizationId,
		contact_name: 'R. Alvarez',
		...overrides,
	});
}

export function createRegionFolder(
	db: DbExecutor,
	organizationId: string,
	overrides: Overrides<'region_folders', 'organization_id'> = {},
): Promise<string> {
	return insertRow(db, 'region_folders', {
		organization_id: organizationId,
		name: 'Zones',
		...overrides,
	});
}

export function createRegion(
	db: DbExecutor,
	organizationId: string,
	overrides: Overrides<'regions', 'organization_id'> = {},
): Promise<string> {
	return insertRow(db, 'regions', {
		organization_id: organizationId,
		geom: fixturePolygon(),
		name: 'Zone 1',
		metadata: null,
		...overrides,
	});
}

// Larval surveillance

export function createHabitat(
	db: DbExecutor,
	organizationId: string,
	overrides: Overrides<'habitats', 'organization_id'> = {},
): Promise<string> {
	return insertRow(db, 'habitats', {
		organization_id: organizationId,
		geom: fixturePoint(),
		habitat_name: 'Ditch',
		description: 'Roadside ditch',
		metadata: null,
		...overrides,
	});
}

export function createInspection(
	db: DbExecutor,
	organizationId: string,
	overrides: Overrides<'inspections', 'organization_id'> = {},
): Promise<string> {
	return insertRow(db, 'inspections', {
		organization_id: organizationId,
		geom: fixturePoint(),
		inspection_date: sql`date '2026-08-01'`,
		is_wet: true,
		...overrides,
	});
}

// Adult surveillance

/** `name` is unique per Organization, so a second method in one test needs its own. */
export function createCollectionMethod(
	db: DbExecutor,
	organizationId: string,
	overrides: Overrides<'collection_methods', 'organization_id'> = {},
): Promise<string> {
	return insertRow(db, 'collection_methods', {
		organization_id: organizationId,
		name: 'CDC light trap',
		...overrides,
	});
}

export function createTrap(
	db: DbExecutor,
	organizationId: string,
	collectionMethodId: string,
	overrides: Overrides<'traps', 'organization_id' | 'collection_method_id'> = {},
): Promise<string> {
	return insertRow(db, 'traps', {
		organization_id: organizationId,
		collection_method_id: collectionMethodId,
		geom: fixturePoint(),
		trap_name: 'North gate',
		...overrides,
	});
}

/**
 * A collection on the exact-timestamp clock.
 *
 * `collections_timing_shape` refuses a row that names neither clock, so
 * `started_at` is part of the default rather than something a caller remembers.
 */
export function createCollection(
	db: DbExecutor,
	organizationId: string,
	links: { readonly trapId: string; readonly collectionMethodId: string },
	overrides: Overrides<'collections', 'organization_id' | 'trap_id' | 'collection_method_id'> = {},
): Promise<string> {
	return insertRow(db, 'collections', {
		organization_id: organizationId,
		trap_id: links.trapId,
		collection_method_id: links.collectionMethodId,
		geom: fixturePoint(),
		collection_timing_mode: 'exact_timestamps',
		started_at: sql`timestamptz '2026-08-01 06:00:00+00'`,
		metadata: null,
		...overrides,
	});
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
	return insertRow(db, 'species', {
		genus_id: genus.id,
		epithet: 'pipiens',
		display_name: 'Culex pipiens',
		...overrides,
	});
}

export function createOrganizationSpecies(
	db: DbExecutor,
	organizationId: string,
	speciesId: string,
	overrides: Overrides<'organization_species', 'organization_id' | 'species_id'> = {},
): Promise<string> {
	return insertRow(db, 'organization_species', {
		organization_id: organizationId,
		species_id: speciesId,
		...overrides,
	});
}

export function createCollectionSpecies(
	db: DbExecutor,
	organizationId: string,
	links: { readonly collectionId: string; readonly speciesId: string },
	overrides: Overrides<
		'collection_species',
		'organization_id' | 'collection_id' | 'species_id'
	> = {},
): Promise<string> {
	return insertRow(db, 'collection_species', {
		organization_id: organizationId,
		collection_id: links.collectionId,
		species_id: links.speciesId,
		count: 12,
		identified_date: sql`date '2026-08-02'`,
		...overrides,
	});
}

// Catalogs

/** `code` is unique across every Organization, so the default carries a counter. */
export function createUnit(db: DbExecutor, overrides: Overrides<'units'> = {}): Promise<string> {
	return insertRow(db, 'units', {
		code: unique('test_unit'),
		unit_name: 'units',
		abbreviation: 'u',
		unit_type: 'count',
		unit_system: 'si',
		...overrides,
	});
}

export function createSourceReductionMethod(
	db: DbExecutor,
	organizationId: string,
	overrides: Overrides<'source_reduction_methods', 'organization_id'> = {},
): Promise<string> {
	return insertRow(db, 'source_reduction_methods', {
		organization_id: organizationId,
		name: 'Ditch clearing',
		...overrides,
	});
}

export function createInsecticide(
	db: DbExecutor,
	organizationId: string,
	defaultUnitId: string,
	overrides: Overrides<'insecticides', 'organization_id' | 'default_unit_id'> = {},
): Promise<string> {
	return insertRow(db, 'insecticides', {
		organization_id: organizationId,
		trade_name: 'Larvicide A',
		active_ingredient: 'Bti',
		type: 'larvicide',
		registration_number: '12345-67',
		default_unit_id: defaultUnitId,
		...overrides,
	});
}

// Field work

export function createRoute(
	db: DbExecutor,
	organizationId: string,
	overrides: Overrides<'routes', 'organization_id'> = {},
): Promise<string> {
	return insertRow(db, 'routes', {
		organization_id: organizationId,
		route_name: 'West larval run',
		route_type: 'habitat',
		...overrides,
	});
}

export function createRouteItem(
	db: DbExecutor,
	organizationId: string,
	links: { readonly routeId: string; readonly entityType: string; readonly entityId: string },
	overrides: Overrides<
		'route_items',
		'organization_id' | 'route_id' | 'entity_type' | 'entity_id'
	> = {},
): Promise<string> {
	return insertRow(db, 'route_items', {
		organization_id: organizationId,
		route_id: links.routeId,
		entity_type: links.entityType,
		entity_id: links.entityId,
		position: 1,
		...overrides,
	});
}

export function createAssignment(
	db: DbExecutor,
	organizationId: string,
	overrides: Overrides<'assignments', 'organization_id'> = {},
): Promise<string> {
	return insertRow(db, 'assignments', {
		organization_id: organizationId,
		assignment_name: 'Thursday larval run',
		assignment_date: sql`date '2026-08-05'`,
		...overrides,
	});
}

/**
 * A stop on an assignment.
 *
 * `assignment_items_assignment_entity_unique` means one assignment cannot visit
 * the same record twice, so two stops in one test need two entity ids.
 */
export function createAssignmentItem(
	db: DbExecutor,
	organizationId: string,
	links: { readonly assignmentId: string; readonly entityType: string; readonly entityId: string },
	overrides: Overrides<
		'assignment_items',
		'organization_id' | 'assignment_id' | 'entity_type' | 'entity_id'
	> = {},
): Promise<string> {
	return insertRow(db, 'assignment_items', {
		organization_id: organizationId,
		assignment_id: links.assignmentId,
		entity_type: links.entityType,
		entity_id: links.entityId,
		position: 1,
		...overrides,
	});
}

// Mission dispatch

/**
 * A request for control work.
 *
 * `control_type` decides which action table can answer it, so a suite testing
 * source reduction passes its own rather than taking the default.
 */
export function createRequestedControlAction(
	db: DbExecutor,
	organizationId: string,
	overrides: Overrides<'requested_control_actions', 'organization_id'> = {},
): Promise<string> {
	return insertRow(db, 'requested_control_actions', {
		organization_id: organizationId,
		control_type: 'application',
		geom: fixturePoint(),
		summary: 'Standing water behind the levee.',
		...overrides,
	});
}

export function createMission(
	db: DbExecutor,
	organizationId: string,
	overrides: Overrides<'missions', 'organization_id'> = {},
): Promise<string> {
	return insertRow(db, 'missions', {
		organization_id: organizationId,
		control_type: 'application',
		scheduled_start_at: sql`timestamptz '2026-08-05 06:00:00+00'`,
		...overrides,
	});
}

export function createMissionItem(
	db: DbExecutor,
	organizationId: string,
	missionId: string,
	overrides: Overrides<'mission_items', 'organization_id' | 'mission_id'> = {},
): Promise<string> {
	return insertRow(db, 'mission_items', {
		organization_id: organizationId,
		mission_id: missionId,
		geom: fixturePoint(),
		position: 1,
		...overrides,
	});
}

// Control operations

/**
 * Control work that actually happened, which is what "worked" means on a stop.
 *
 * The method and the unit are the caller's, because a suite that files two of
 * these against one Organization needs the method names to differ.
 */
export function createSourceReduction(
	db: DbExecutor,
	organizationId: string,
	links: { readonly methodId: string; readonly unitId: string },
	overrides: Overrides<
		'source_reductions',
		'organization_id' | 'source_reduction_method_id' | 'sources_eliminated_unit_id'
	> = {},
): Promise<string> {
	return insertRow(db, 'source_reductions', {
		organization_id: organizationId,
		source_reduction_method_id: links.methodId,
		source_reduction_date: sql`date '2026-08-01'`,
		geom: fixturePoint(),
		sources_eliminated_amount: 3,
		sources_eliminated_unit_id: links.unitId,
		...overrides,
	});
}

// Public engagement

export function createNotificationType(
	db: DbExecutor,
	organizationId: string,
	overrides: Overrides<'notification_types', 'organization_id'> = {},
): Promise<string> {
	return insertRow(db, 'notification_types', {
		organization_id: organizationId,
		name: 'Adulticiding',
		...overrides,
	});
}

export function createNotificationRegistration(
	db: DbExecutor,
	organizationId: string,
	contactId: string,
	overrides: Overrides<'notification_registrations', 'organization_id' | 'contact_id'> = {},
): Promise<string> {
	return insertRow(db, 'notification_registrations', {
		organization_id: organizationId,
		contact_id: contactId,
		geom: fixturePoint(),
		...overrides,
	});
}

/** A request from the public, which needs both an address and a contact to point at. */
export function createServiceRequest(
	db: DbExecutor,
	organizationId: string,
	links: { readonly addressId: string; readonly contactId: string },
	overrides: Overrides<'service_requests', 'organization_id' | 'address_id' | 'contact_id'> = {},
): Promise<string> {
	return insertRow(db, 'service_requests', {
		organization_id: organizationId,
		address_id: links.addressId,
		contact_id: links.contactId,
		geom: fixturePoint(),
		request_date: sql`date '2026-08-01'`,
		intake_type: 'phone',
		details: 'Standing water behind the levee.',
		metadata: null,
		...overrides,
	});
}

/**
 * One notice a mission owes one registration.
 *
 * All four parents are the caller's: what a guard reads is that a row is here,
 * and inventing a mission would hide which one the test meant.
 */
export function createMissionNotification(
	db: DbExecutor,
	organizationId: string,
	links: {
		readonly missionId: string;
		readonly registrationId: string;
		readonly contactId: string;
		readonly notificationTypeId: string;
	},
	overrides: Overrides<
		'mission_notifications',
		| 'organization_id'
		| 'mission_id'
		| 'notification_registration_id'
		| 'contact_id'
		| 'notification_type_id'
	> = {},
): Promise<string> {
	return insertRow(db, 'mission_notifications', {
		organization_id: organizationId,
		mission_id: links.missionId,
		notification_registration_id: links.registrationId,
		contact_id: links.contactId,
		notification_type_id: links.notificationTypeId,
		channel: 'email',
		...overrides,
	});
}

// Shared across domains

export function createTag(
	db: DbExecutor,
	organizationId: string,
	overrides: Overrides<'tags', 'organization_id'> = {},
): Promise<string> {
	return insertRow(db, 'tags', {
		organization_id: organizationId,
		tag_name: 'Standing water',
		...overrides,
	});
}

export function createTagItem(
	db: DbExecutor,
	organizationId: string,
	links: { readonly tagId: string; readonly entityType: string; readonly entityId: string },
	overrides: Overrides<
		'tag_items',
		'organization_id' | 'tag_id' | 'entity_type' | 'entity_id'
	> = {},
): Promise<string> {
	return insertRow(db, 'tag_items', {
		organization_id: organizationId,
		tag_id: links.tagId,
		entity_type: links.entityType,
		entity_id: links.entityId,
		...overrides,
	});
}

export function createComment(
	db: DbExecutor,
	organizationId: string,
	links: { readonly entityType: string; readonly entityId: string },
	overrides: Overrides<'comments', 'organization_id' | 'entity_type' | 'entity_id'> = {},
): Promise<string> {
	return insertRow(db, 'comments', {
		organization_id: organizationId,
		entity_type: links.entityType,
		entity_id: links.entityId,
		comment_text: 'Note',
		...overrides,
	});
}
