import { expect, it } from 'vitest';
import type { DbExecutor, NearbyRecordsInput } from '../../index.js';
import { DEFAULT_NEARBY_FAMILIES, listNearbyRecords, sql } from '../../index.js';
import { describeDbIntegration, withTestDb } from '../../test-support/db-integration.js';
import { createOrganization } from '../../test-support/row-fixtures.js';

// The request every case is centred on. Nothing here reads it as a row: it is
// the point the radius is drawn around and the id the public-engagement family
// leaves out of its own result.
const CENTER = {
	id: 'c2a0e1d4-6b3f-4e8a-9d17-5f0b2c8a4e61',
	lat: 35.5,
	lng: -90.5,
} as const;

/** The question every case asks, with the window and zone the seeds sit inside. */
function nearby(
	organizationId: string,
	overrides: Partial<NearbyRecordsInput> = {},
): NearbyRecordsInput {
	return {
		organizationId,
		request: CENTER,
		radiusMeters: 500,
		dateFrom: '2026-07-01',
		dateTo: '2026-08-01',
		timeZone: 'America/New_York',
		families: DEFAULT_NEARBY_FAMILIES,
		...overrides,
	};
}

function point(lng: number, lat: number) {
	return sql<string>`st_setsrid(st_makepoint(${lng}, ${lat}), 4326)`;
}

/** ~33 m north of the center, comfortably inside a 500 m radius. */
const NEAR = point(-90.5, 35.5003);
/** ~5 km north, outside the radius. */
const FAR = point(-90.5, 35.545);

describeDbIntegration('service-request nearby', () => {
	// One call plans every branch of the union, so this validates the SQL
	// (columns, geography casts, ST_DWithin, date window) end-to-end even though
	// only habitats are seeded — Postgres plans every branch regardless of data.
	it('returns records within the radius and excludes those outside it', async () => {
		await withTestDb(async ({ db }) => {
			const organizationId = await createOrganization(db);
			await insertHabitat(db, organizationId, 'Near Pond', NEAR);
			await insertHabitat(db, organizationId, 'Far Pond', FAR);

			const rows = await listNearbyRecords(db, nearby(organizationId));

			const habitats = rows.filter((row) => row.category === 'habitat');
			expect(habitats).toHaveLength(1);
			expect(habitats[0]?.label).toBe('Near Pond');
			expect(habitats[0]?.distanceMeters).toBeGreaterThan(0);
			expect(habitats[0]?.distanceMeters).toBeLessThan(500);
		});
	});

	// The nearby view is date-bounded, so the same failure as the collections
	// explorer applies here: a collection emptied in the evening converts to the
	// next day in the database server's zone and falls out of the window.
	it('dates a collection by the organization’s day, not the database server’s', async () => {
		await withTestDb(async ({ db }) => {
			const organizationId = await createOrganization(db);
			const method = await db
				.insertInto('collection_methods')
				.values({ organization_id: organizationId, name: 'CDC light trap' })
				.returning(['id'])
				.executeTakeFirstOrThrow();

			// 10:30pm on 15 March in New York; 16 March in UTC.
			await db
				.insertInto('collections')
				.values({
					organization_id: organizationId,
					geom: NEAR,
					collection_method_id: method.id,
					collection_timing_mode: 'exact_timestamps',
					started_at: new Date('2026-03-14T14:00:00.000Z'),
					collected_at: new Date('2026-03-16T02:30:00.000Z'),
				})
				.execute();

			const onTheFifteenth = async (timeZone: string) =>
				(
					await listNearbyRecords(
						db,
						nearby(organizationId, { dateFrom: '2026-03-15', dateTo: '2026-03-15', timeZone }),
					)
				).filter((row) => row.category === 'collection');

			const eastern = await onTheFifteenth('America/New_York');
			expect(eastern).toHaveLength(1);
			expect(eastern[0]?.date).toBe('2026-03-15');

			expect(await onTheFifteenth('UTC')).toHaveLength(0);
		});
	});

	// The row is the activity row for the same record. A nearby row used to
	// carry one label, one ref and one status, so the service request page could
	// not draw the list row Daily Work draws; this is what the wider row has to
	// carry for the page to read it the same way.
	it('carries every column the activity row carries, plus the distance', async () => {
		await withTestDb(async ({ db }) => {
			const organizationId = await createOrganization(db);
			const habitatType = await db
				.insertInto('habitat_types')
				.values({ organization_id: organizationId, name: 'Catch basin' })
				.returning(['id'])
				.executeTakeFirstOrThrow();
			const habitat = await db
				.insertInto('habitats')
				.values({
					organization_id: organizationId,
					geom: NEAR,
					habitat_name: 'Culvert 12',
					habitat_type_id: habitatType.id,
					description: '',
					metadata: null,
				})
				.returning(['id'])
				.executeTakeFirstOrThrow();
			await db
				.insertInto('inspections')
				.values({
					organization_id: organizationId,
					geom: NEAR,
					habitat_id: habitat.id,
					habitat_type_id: habitatType.id,
					inspection_date: new Date('2026-07-10T12:00:00'),
					is_wet: true,
					density: 'light',
					has_third_instar: true,
				})
				.execute();

			const rows = await listNearbyRecords(db, nearby(organizationId));

			const inspection = rows.find((row) => row.category === 'inspection');
			expect(inspection).toMatchObject({
				family: 'larval',
				date: '2026-07-10',
				occurredAt: null,
				label: null,
				// The habitat it was performed at, joined here because habitats do
				// not stream to the client.
				placeName: 'Culvert 12',
				refId: habitatType.id,
				methodRefId: null,
				amount: null,
				unitId: null,
				detail: 'light',
				stages: '3',
				context: null,
				hasBycatch: null,
				tagIds: null,
			});
			expect(inspection?.distanceMeters).toBeGreaterThan(0);

			// A place is dated by the day its record was created, which is the
			// activity register's rule; a bare `null` here would be a second rule.
			const place = rows.find((row) => row.category === 'habitat');
			expect(place).toMatchObject({ family: 'larval', label: 'Culvert 12', detail: 'active' });
			expect(place?.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
		});
	});

	// The other requests around this one, which the redesigned page draws. The
	// request itself is the nearest request to its own centre, so it is left out
	// by id rather than by distance.
	it('returns other service requests in the window, and never the request itself', async () => {
		await withTestDb(async ({ db }) => {
			const organizationId = await createOrganization(db);
			const self = await insertServiceRequest(db, organizationId, {
				id: CENTER.id,
				geom: point(CENTER.lng, CENTER.lat),
				display_name: 1,
				request_date: new Date('2026-07-15T12:00:00'),
			});
			const other = await insertServiceRequest(db, organizationId, {
				geom: NEAR,
				display_name: 2,
				request_date: new Date('2026-07-20T12:00:00'),
				closed_at: new Date('2026-07-21T15:00:00.000Z'),
			});
			await insertServiceRequest(db, organizationId, {
				geom: NEAR,
				display_name: 3,
				request_date: new Date('2026-09-01T12:00:00'),
			});
			await insertServiceRequest(db, organizationId, {
				geom: FAR,
				display_name: 4,
				request_date: new Date('2026-07-20T12:00:00'),
			});

			const rows = await listNearbyRecords(
				db,
				nearby(organizationId, { families: ['publicEngagement'] }),
			);

			expect(rows.map((row) => row.id)).toEqual([other]);
			expect(rows.map((row) => row.id)).not.toContain(self);
			expect(rows[0]).toMatchObject({
				category: 'serviceRequest',
				family: 'publicEngagement',
				date: '2026-07-20',
				label: 'Request 2',
				placeName: '100 Main St',
				detail: 'closed',
			});
		});
	});

	// Which families come back is the caller's, and the default is the three
	// operational ones, which is what the endpoint answered before it could
	// return requests at all. Public engagement is outreach as well as requests,
	// because the family is read off the register rather than a list of tables.
	it('reads only the families asked for', async () => {
		await withTestDb(async ({ db }) => {
			const organizationId = await createOrganization(db);
			await insertHabitat(db, organizationId, 'Near Pond', NEAR);
			await insertServiceRequest(db, organizationId, {
				geom: NEAR,
				display_name: 2,
				request_date: new Date('2026-07-20T12:00:00'),
			});
			const outreachMethod = await db
				.insertInto('outreach_methods')
				.values({ organization_id: organizationId, name: 'Door hanger' })
				.returning(['id'])
				.executeTakeFirstOrThrow();
			await db
				.insertInto('outreach_actions')
				.values({
					organization_id: organizationId,
					geom: NEAR,
					outreach_method_id: outreachMethod.id,
					outreach_date: new Date('2026-07-22T12:00:00'),
					reach: 40,
				})
				.execute();

			const categories = async (families: NearbyRecordsInput['families']) =>
				(await listNearbyRecords(db, nearby(organizationId, { families }))).map(
					(row) => row.category,
				);

			expect(await categories(DEFAULT_NEARBY_FAMILIES)).toEqual(['habitat']);
			expect(await categories(['larval', 'publicEngagement'])).toEqual([
				'habitat',
				'outreach',
				'serviceRequest',
			]);
			expect(await categories(['adult'])).toEqual([]);
			expect(await categories([])).toEqual([]);
		});
	});
});

async function insertHabitat(
	db: DbExecutor,
	organizationId: string,
	name: string,
	geom: ReturnType<typeof point>,
): Promise<string> {
	const row = await db
		.insertInto('habitats')
		.values({
			organization_id: organizationId,
			geom,
			habitat_name: name,
			description: '',
			metadata: null,
		})
		.returning(['id'])
		.executeTakeFirstOrThrow();
	return row.id;
}

/**
 * A request at `geom`, logged against an address at the same point named
 * `100 Main St`, by a caller. Both are required columns on the row.
 */
async function insertServiceRequest(
	db: DbExecutor,
	organizationId: string,
	values: {
		readonly id?: string;
		readonly geom: ReturnType<typeof point>;
		readonly display_name: number;
		readonly request_date: Date;
		readonly closed_at?: Date;
	},
): Promise<string> {
	const address = await db
		.insertInto('addresses')
		.values({
			organization_id: organizationId,
			geom: values.geom,
			display_name: '100 Main St',
			country: 'US',
		})
		.returning(['id'])
		.executeTakeFirstOrThrow();
	const contact = await db
		.insertInto('contacts')
		.values({ organization_id: organizationId, contact_name: 'A. Caller' })
		.returning(['id'])
		.executeTakeFirstOrThrow();
	const row = await db
		.insertInto('service_requests')
		.values({
			organization_id: organizationId,
			address_id: address.id,
			contact_id: contact.id,
			details: 'Standing water.',
			...values,
		})
		.returning(['id'])
		.executeTakeFirstOrThrow();
	return row.id;
}
