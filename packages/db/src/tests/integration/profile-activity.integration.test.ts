import { expect, it } from 'vitest';
import type { DbExecutor } from '../../index.js';
import {
	countProfileActivity,
	listProfileActivity,
	type ProfileActivityRow,
	sql,
} from '../../index.js';
import { describeDbIntegration, withTestDb } from '../../test-support/db-integration.js';

// --- what one Profile's activity log actually answers -------------------------
//
// Every case here is a way this read returns a **plausible wrong answer** rather
// than failing: an assisting join that matches nothing, a collection dated by
// the column its agency does not use, a visit collapsed into another visit, a
// record counted because someone typed it in the evening. All of them look like
// "that person had a quiet week", which is a conclusion a supervisor will act on.
//
// The window is one month, and every seeded date sits inside it, so a row that
// is missing is missing because a predicate excluded it.

const DATE_FROM = '2026-08-01';
const DATE_TO = '2026-08-31';
/** A zone five hours behind UTC in August, so a UTC/local disagreement shows up. */
const AGENCY_TIME_ZONE = 'America/New_York';

describeDbIntegration('profile activity', () => {
	it('counts field attribution, not data entry', async () => {
		await withTestDb(async ({ db }) => {
			const world = await seedActivityWorld(db);

			const rows = await activityFor(db, world.ownOrganizationId, world.danaProfileId);

			const inspections = rows.filter((row) => row.category === 'inspection');
			expect(entryKeys(inspections)).toEqual(['inspection:inspected:2026-08-05']);
			// The inspection Dana only typed up, the one that was deleted, and the
			// one another person ran are all absent — and the first of those is the
			// rule: `created_by_profile_id` is not presence at the coordinates.
			expect(inspections[0]?.id).toBe(world.inspectedId);
			expect(inspections[0]?.involvement).toBe('primary');
		});
	});

	// The single highest-value assertion here. `additional_personnel.entity_type`
	// is stored snake_case while the domain vocabulary is camelCase, so a filter
	// written in the domain's spelling matches nothing at all — and an assisting
	// half that returns zero rows is indistinguishable from nobody assisting.
	it('matches assisting links by their snake_case entity type, and only those', async () => {
		await withTestDb(async ({ db }) => {
			const world = await seedActivityWorld(db);

			const rows = await activityFor(db, world.ownOrganizationId, world.danaProfileId);

			const assisting = rows.filter((row) => row.involvement === 'assisting');
			expect(assisting).toHaveLength(1);
			expect(assisting[0]?.id).toBe(world.assistedSourceReductionId);
			expect(assisting[0]?.role).toBe('assisted');
			expect(assisting[0]?.category).toBe('sourceReduction');
			// The camelCase-spelled link and the soft-deleted one are both absent.
			expect(rows.map((row) => row.id)).not.toContain(world.camelCaseLinkedSourceReductionId);
			expect(rows.map((row) => row.id)).not.toContain(world.deletedLinkSourceReductionId);
		});
	});

	// `collections_timing_shape` admits an exact-timestamp shape or a date +
	// duration shape and nothing in between, so reading either column alone
	// silently empties adult surveillance for every agency on the other mode.
	it('dates collections in both timing modes, and splits the two visits', async () => {
		await withTestDb(async ({ db }) => {
			const world = await seedActivityWorld(db);

			const rows = await activityFor(db, world.ownOrganizationId, world.danaProfileId);
			const collections = rows.filter((row) => row.category === 'collection');

			// A trap set on the 10th and collected on the 13th is two field visits,
			// and it belongs on both days — collapsing it loses one of them.
			expect(entriesFor(collections, world.spanningCollectionId)).toEqual([
				'set:2026-08-10',
				'collected:2026-08-13',
			]);
			// The date + duration shape carries no timestamps at all; both visits
			// are dated by the collection date, which is all that shape records.
			expect(entriesFor(collections, world.durationCollectionId)).toEqual([
				'set:2026-08-12',
				'collected:2026-08-12',
			]);
			// Set but not yet collected: the set visit happened, the collect visit
			// has not.
			expect(entriesFor(collections, world.openCollectionId)).toEqual(['set:2026-08-11']);
		});
	});

	it('reports a service request as two moments, on their own dates', async () => {
		await withTestDb(async ({ db }) => {
			const world = await seedActivityWorld(db);

			const rows = await activityFor(db, world.ownOrganizationId, world.danaProfileId);

			expect(
				entriesFor(
					rows.filter((row) => row.category === 'serviceRequest'),
					world.serviceRequestId,
				),
			).toEqual(['received:2026-08-02', 'closed:2026-08-20']);
		});
	});

	it('leaves another agency’s records unreachable', async () => {
		await withTestDb(async ({ db }) => {
			const world = await seedActivityWorld(db);

			// The neighbouring agency's inspection exists, is inside the window, and
			// is attributed to the Profile being asked about — the agency scope is
			// the only thing standing between it and this log.
			const rows = await activityFor(db, world.ownOrganizationId, world.otherProfileId);

			expect(rows).toEqual([]);
		});
	});

	// A row that says only "Inspection" is a row nobody can act on, so each entry
	// carries what its explorer's list item shows: the site it happened at, the
	// lookup that names its kind, the quantity it measured, and its one status.
	it('carries the site and kind a list row is titled by', async () => {
		await withTestDb(async ({ db }) => {
			const world = await seedActivityWorld(db);

			const rows = await activityFor(db, world.ownOrganizationId, world.danaProfileId);

			// The habitat the inspection was performed at, joined here because
			// habitats do not stream to the client.
			expect(pick(rows, (row) => row.category === 'inspection')).toMatchObject({
				siteName: 'Culvert 12',
				refId: world.habitatTypeId,
				detail: 'light',
			});
			// The trap the collection came out of.
			expect(pick(rows, (row) => row.id === world.spanningCollectionId)).toMatchObject({
				siteName: 'T-1 - North gate',
				refId: world.collectionMethodId,
			});
			expect(pick(rows, (row) => row.role === 'received')).toMatchObject({
				label: 'Request 42',
				siteName: '100 Main St',
				detail: 'closed',
			});
		});
	});

	it('carries the quantity a control action measured, and its unit', async () => {
		await withTestDb(async ({ db }) => {
			const world = await seedActivityWorld(db);

			const rows = await activityFor(db, world.ownOrganizationId, world.danaProfileId);

			expect(pick(rows, (row) => row.category === 'sourceReduction')).toMatchObject({
				refId: world.sourceReductionMethodId,
				amount: 3,
				unitId: world.unitId,
			});
		});
	});

	// A `timestamptz` becomes a calendar date in whichever zone does the
	// converting, and the database server's is not the agency's. An evening's
	// work filed under tomorrow is missing from the day it was done — and, at the
	// edge of a range, missing from the log entirely.
	it('dates timestamped work in the agency’s timezone, not the server’s', async () => {
		await withTestDb(async ({ db }) => {
			const world = await seedActivityWorld(db);

			const eastern = await activityFor(db, world.ownOrganizationId, world.danaProfileId);
			const utc = await activityFor(db, world.ownOrganizationId, world.danaProfileId, 'UTC');

			// Seeded 2026-08-04T01:30Z — 9:30pm on the 3rd in New York.
			expect(pick(eastern, (row) => row.id === world.lateTrapId).date).toBe('2026-08-03');
			expect(pick(utc, (row) => row.id === world.lateTrapId).date).toBe('2026-08-04');
		});
	});

	it('refuses a timezone that is not an IANA name', async () => {
		await withTestDb(async ({ db }) => {
			const world = await seedActivityWorld(db);

			await expect(
				activityFor(db, world.ownOrganizationId, world.danaProfileId, "UTC'; drop table traps --"),
			).rejects.toThrow(/Invalid IANA time zone/);
		});
	});

	it('counts every entry the cap hid', async () => {
		await withTestDb(async ({ db }) => {
			const world = await seedActivityWorld(db);

			const capped = await listProfileActivity(db, {
				organizationId: world.ownOrganizationId,
				profileId: world.danaProfileId,
				dateFrom: DATE_FROM,
				dateTo: DATE_TO,
				timeZone: AGENCY_TIME_ZONE,
				limit: 2,
			});
			const total = await countProfileActivity(db, {
				organizationId: world.ownOrganizationId,
				profileId: world.danaProfileId,
				dateFrom: DATE_FROM,
				dateTo: DATE_TO,
				timeZone: AGENCY_TIME_ZONE,
			});

			expect(capped).toHaveLength(2);
			// The whole point: a truncated log can say how much it is missing.
			expect(total).toBeGreaterThan(capped.length);
			const uncapped = await activityFor(db, world.ownOrganizationId, world.danaProfileId);
			expect(total).toBe(uncapped.length);
		});
	});

	it('orders newest first and carries the coordinates the map draws', async () => {
		await withTestDb(async ({ db }) => {
			const world = await seedActivityWorld(db);

			const rows = await activityFor(db, world.ownOrganizationId, world.danaProfileId);

			const dates = rows.map((row) => row.date);
			expect(dates).toEqual([...dates].sort().reverse());
			for (const row of rows) {
				expect(typeof row.lat).toBe('number');
				expect(typeof row.lng).toBe('number');
			}
		});
	});
});

// --- helpers -----------------------------------------------------------------

function activityFor(
	db: Parameters<typeof listProfileActivity>[0],
	organizationId: string,
	profileId: string,
	timeZone: string = AGENCY_TIME_ZONE,
): Promise<ProfileActivityRow[]> {
	return listProfileActivity(db, {
		organizationId,
		profileId,
		dateFrom: DATE_FROM,
		dateTo: DATE_TO,
		timeZone,
	});
}

/** `category:role:date`, the shape an assertion can read at a glance. */
function entryKeys(rows: readonly ProfileActivityRow[]): string[] {
	return rows.map((row) => `${row.category}:${row.role}:${row.date}`);
}

/** The first row matching, or a failure that names what was missing. */
function pick(
	rows: readonly ProfileActivityRow[],
	match: (row: ProfileActivityRow) => boolean,
): ProfileActivityRow {
	const row = rows.find(match);
	if (row === undefined) {
		throw new Error('No activity row matched.');
	}
	return row;
}

/**
 * The `role:date` entries one record produced, oldest first.
 *
 * Ties break on the order the visits happen in rather than alphabetically: a
 * date + duration collection files both of its visits on the same day, and an
 * assertion reading `collected` before `set` would be describing the ordering
 * of this helper rather than anything about the data.
 */
const VISIT_ORDER: Readonly<Record<string, number>> = {
	set: 0,
	received: 0,
	collected: 1,
	closed: 1,
};

function entriesFor(rows: readonly ProfileActivityRow[], id: string): string[] {
	return rows
		.filter((row) => row.id === id)
		.map((row) => ({
			key: `${row.role}:${row.date}`,
			date: row.date,
			rank: VISIT_ORDER[row.role] ?? 0,
		}))
		.sort((first, second) => first.date.localeCompare(second.date) || first.rank - second.rank)
		.map((entry) => entry.key);
}

interface ActivityWorld {
	readonly ownOrganizationId: string;
	readonly danaProfileId: string;
	readonly otherProfileId: string;
	readonly inspectedId: string;
	readonly assistedSourceReductionId: string;
	readonly camelCaseLinkedSourceReductionId: string;
	readonly deletedLinkSourceReductionId: string;
	readonly spanningCollectionId: string;
	readonly durationCollectionId: string;
	readonly openCollectionId: string;
	readonly serviceRequestId: string;
	readonly lateTrapId: string;
	readonly habitatTypeId: string;
	readonly collectionMethodId: string;
	readonly sourceReductionMethodId: string;
	readonly unitId: string;
}

function point(lng: number, lat: number) {
	return sql<string>`st_setsrid(st_makepoint(${lng}, ${lat}), 4326)`;
}

/**
 * A `date` column's value, as a `Date` the driver cannot shift off it.
 *
 * The driver serializes a `Date` in the *client's* timezone, so a UTC midnight
 * arrives at a `date` column as the day before anywhere west of Greenwich —
 * which seeds the fixture one day off and fails this suite on the developer's
 * timezone rather than on the query.
 */
function calendarDate(date: string): Date {
	return new Date(`${date}T12:00:00`);
}

/**
 * One agency's August, plus a neighbouring agency's.
 *
 * Timestamps are mid-day UTC on purpose: a `timestamptz` becomes a date in the
 * session's timezone, and a midnight-adjacent moment would make this suite pass
 * or fail on where the database happens to think it is.
 */
async function seedActivityWorld(db: DbExecutor): Promise<ActivityWorld> {
	const [own, other] = await Promise.all([
		insertOrganization(db, 'org_activity_own', 'Activity District'),
		insertOrganization(db, 'org_activity_other', 'Neighbouring District'),
	]);

	const dana = await insertProfile(db, own, 'Dana Reyes');
	const casey = await insertProfile(db, own, 'Casey Okafor');
	const otherProfile = await insertProfile(db, other, 'Neighbour Technician');

	const unit = await db
		.insertInto('units')
		.values({
			code: 'activity_container',
			unit_name: 'Container',
			abbreviation: 'ct',
			unit_type: 'count',
			unit_system: 'si',
		})
		.returning(['id'])
		.executeTakeFirstOrThrow();

	const collectionMethod = await db
		.insertInto('collection_methods')
		.values({ organization_id: own, name: 'Gravid trap' })
		.returning(['id'])
		.executeTakeFirstOrThrow();

	const sourceReductionMethod = await db
		.insertInto('source_reduction_methods')
		.values({ organization_id: own, name: 'Container removal' })
		.returning(['id'])
		.executeTakeFirstOrThrow();

	const habitatType = await db
		.insertInto('habitat_types')
		.values({ organization_id: own, name: 'Roadside ditch' })
		.returning(['id'])
		.executeTakeFirstOrThrow();

	// The site each record hangs off, which is what a list row is titled by.
	const habitat = await db
		.insertInto('habitats')
		.values({
			organization_id: own,
			geom: point(-90.5, 35.5),
			habitat_type_id: habitatType.id,
			habitat_name: 'Culvert 12',
			description: '',
			metadata: null,
		})
		.returning(['id'])
		.executeTakeFirstOrThrow();

	const trap = await db
		.insertInto('traps')
		.values({
			organization_id: own,
			geom: point(-90.5, 35.5),
			collection_method_id: collectionMethod.id,
			trap_code: 'T-1',
			trap_name: 'North gate',
		})
		.returning(['id'])
		.executeTakeFirstOrThrow();

	// Placed at 9:30pm Eastern, which is already tomorrow in UTC.
	const lateTrap = await db
		.insertInto('traps')
		.values({
			organization_id: own,
			geom: point(-90.5, 35.5),
			collection_method_id: collectionMethod.id,
			trap_code: 'T-2',
			trap_name: 'Late shift',
			created_by_profile_id: dana,
			created_at: new Date('2026-08-04T01:30:00.000Z'),
		})
		.returning(['id'])
		.executeTakeFirstOrThrow();

	// --- inspections: the attribution rule, three ways --------------------------

	const inspected = await insertInspection(db, {
		organizationId: own,
		date: '2026-08-05',
		inspectedBy: dana,
		createdBy: casey,
		habitatId: habitat.id,
		habitatTypeId: habitatType.id,
	});
	// Dana typed this one up; Casey was the one at the ditch.
	await insertInspection(db, {
		organizationId: own,
		date: '2026-08-06',
		inspectedBy: casey,
		createdBy: dana,
	});
	await insertInspection(db, {
		organizationId: own,
		date: '2026-08-07',
		inspectedBy: dana,
		createdBy: dana,
		deleted: true,
	});
	// The neighbouring agency's own work, attributed to its own person.
	await insertInspection(db, {
		organizationId: other,
		date: '2026-08-08',
		inspectedBy: otherProfile,
		createdBy: otherProfile,
	});

	// --- source reductions: the assisting join ---------------------------------

	const assisted = await insertSourceReduction(db, own, sourceReductionMethod.id, unit.id, casey);
	const camelCaseLinked = await insertSourceReduction(
		db,
		own,
		sourceReductionMethod.id,
		unit.id,
		casey,
	);
	const deletedLink = await insertSourceReduction(
		db,
		own,
		sourceReductionMethod.id,
		unit.id,
		casey,
	);

	await db
		.insertInto('additional_personnel')
		.values([
			{
				organization_id: own,
				personnel_profile_id: dana,
				entity_type: 'source_reduction',
				entity_id: assisted,
			},
			{
				// The domain's camelCase spelling, which the column never holds.
				organization_id: own,
				personnel_profile_id: dana,
				entity_type: 'sourceReduction',
				entity_id: camelCaseLinked,
			},
			{
				organization_id: own,
				personnel_profile_id: dana,
				entity_type: 'source_reduction',
				entity_id: deletedLink,
				deleted_at: new Date('2026-08-15T12:00:00.000Z'),
			},
		])
		.execute();

	// --- collections: two visits, two timing modes ------------------------------

	const spanning = await insertCollection(db, {
		organizationId: own,
		collectionMethodId: collectionMethod.id,
		trapId: trap.id,
		setBy: dana,
		collectedBy: dana,
		startedAt: new Date('2026-08-10T14:00:00.000Z'),
		collectedAt: new Date('2026-08-13T13:00:00.000Z'),
	});
	const open = await insertCollection(db, {
		organizationId: own,
		collectionMethodId: collectionMethod.id,
		setBy: dana,
		collectedBy: null,
		startedAt: new Date('2026-08-11T14:00:00.000Z'),
		collectedAt: null,
	});
	const duration = await insertCollection(db, {
		organizationId: own,
		collectionMethodId: collectionMethod.id,
		setBy: dana,
		collectedBy: dana,
		collectionDate: '2026-08-12',
		durationUnitId: unit.id,
	});

	// --- a service request: received and closed ---------------------------------

	const address = await db
		.insertInto('addresses')
		.values({
			organization_id: own,
			geom: point(-90.5, 35.5),
			display_name: '100 Main St',
			country: 'US',
		})
		.returning(['id'])
		.executeTakeFirstOrThrow();

	const contact = await db
		.insertInto('contacts')
		.values({ organization_id: own, contact_name: 'A. Caller' })
		.returning(['id'])
		.executeTakeFirstOrThrow();

	const serviceRequest = await db
		.insertInto('service_requests')
		.values({
			organization_id: own,
			geom: point(-90.5, 35.5),
			display_name: 42,
			request_date: calendarDate('2026-08-02'),
			address_id: address.id,
			contact_id: contact.id,
			received_by_profile_id: dana,
			closed_at: new Date('2026-08-20T15:00:00.000Z'),
			closed_by_profile_id: dana,
			details: 'Standing water behind the property.',
		})
		.returning(['id'])
		.executeTakeFirstOrThrow();

	return {
		ownOrganizationId: own,
		danaProfileId: dana,
		otherProfileId: otherProfile,
		inspectedId: inspected,
		assistedSourceReductionId: assisted,
		camelCaseLinkedSourceReductionId: camelCaseLinked,
		deletedLinkSourceReductionId: deletedLink,
		spanningCollectionId: spanning,
		durationCollectionId: duration,
		openCollectionId: open,
		serviceRequestId: serviceRequest.id,
		lateTrapId: lateTrap.id,
		habitatTypeId: habitatType.id,
		collectionMethodId: collectionMethod.id,
		sourceReductionMethodId: sourceReductionMethod.id,
		unitId: unit.id,
	};
}

async function insertOrganization(db: DbExecutor, workosId: string, name: string): Promise<string> {
	const row = await db
		.insertInto('organizations')
		.values({ workos_organization_id: workosId, name })
		.returning(['id'])
		.executeTakeFirstOrThrow();
	return row.id;
}

async function insertProfile(
	db: DbExecutor,
	organizationId: string,
	displayName: string,
): Promise<string> {
	const row = await db
		.insertInto('profiles')
		.values({
			organization_id: organizationId,
			display_name: displayName,
			email: `${displayName.replace(/\W+/g, '.').toLowerCase()}.${organizationId}@example.test`,
		})
		.returning(['id'])
		.executeTakeFirstOrThrow();
	return row.id;
}

async function insertInspection(
	db: DbExecutor,
	input: {
		readonly organizationId: string;
		readonly date: string;
		readonly inspectedBy: string;
		readonly createdBy: string;
		readonly deleted?: boolean;
		readonly habitatId?: string;
		readonly habitatTypeId?: string;
	},
): Promise<string> {
	const row = await db
		.insertInto('inspections')
		.values({
			organization_id: input.organizationId,
			geom: point(-90.5, 35.5),
			inspection_date: calendarDate(input.date),
			inspected_by_profile_id: input.inspectedBy,
			created_by_profile_id: input.createdBy,
			habitat_id: input.habitatId ?? null,
			habitat_type_id: input.habitatTypeId ?? null,
			is_wet: true,
			dip_count: 8,
			density: 'light' as const,
			deleted_at: input.deleted === true ? new Date('2026-08-09T12:00:00.000Z') : null,
		})
		.returning(['id'])
		.executeTakeFirstOrThrow();
	return row.id;
}

async function insertSourceReduction(
	db: DbExecutor,
	organizationId: string,
	methodId: string,
	unitId: string,
	technicianId: string,
): Promise<string> {
	const row = await db
		.insertInto('source_reductions')
		.values({
			organization_id: organizationId,
			geom: point(-90.5, 35.5),
			source_reduction_method_id: methodId,
			technician_profile_id: technicianId,
			source_reduction_date: calendarDate('2026-08-18'),
			sources_eliminated_amount: 3,
			sources_eliminated_unit_id: unitId,
		})
		.returning(['id'])
		.executeTakeFirstOrThrow();
	return row.id;
}

async function insertCollection(
	db: DbExecutor,
	input: {
		readonly organizationId: string;
		readonly collectionMethodId: string;
		readonly trapId?: string;
		readonly setBy: string;
		readonly collectedBy: string | null;
		readonly startedAt?: Date;
		readonly collectedAt?: Date | null;
		readonly collectionDate?: string;
		readonly durationUnitId?: string;
	},
): Promise<string> {
	const exact = input.collectionDate === undefined;
	const row = await db
		.insertInto('collections')
		.values({
			organization_id: input.organizationId,
			geom: point(-90.5, 35.5),
			collection_method_id: input.collectionMethodId,
			trap_id: input.trapId ?? null,
			set_by_profile_id: input.setBy,
			collected_by_profile_id: input.collectedBy,
			...(exact
				? {
						collection_timing_mode: 'exact_timestamps' as const,
						started_at: input.startedAt ?? null,
						collected_at: input.collectedAt ?? null,
					}
				: {
						collection_timing_mode: 'collection_date_duration' as const,
						collection_date: calendarDate(input.collectionDate),
						duration_amount: 24,
						duration_unit_id: input.durationUnitId,
					}),
		})
		.returning(['id'])
		.executeTakeFirstOrThrow();
	return row.id;
}
