import { expect, it } from 'vitest';
import { type DbExecutor, getServiceRequestCenter, listNearbyRecords, sql } from '../../index.js';
import { describeDbIntegration, withTestDb } from '../../test-support/db-integration.js';
import { createOrganization } from '../../test-support/row-fixtures.js';

describeDbIntegration('service-request center', () => {
	// The close is the end anchor of the nearby window, so it is a day in the
	// organization's zone the way every operational date is: 10:30pm on 20
	// August in New York is 21 August in UTC, and the window must end on the
	// day the person who closed it was on.
	it('reads the close as a day in the organization’s zone', async () => {
		await withTestDb(async ({ db }) => {
			const organizationId = await createOrganization(db);
			const id = await insertServiceRequest(db, organizationId, {
				closedAt: new Date('2026-08-21T02:30:00.000Z'),
			});

			const eastern = await getServiceRequestCenter(db, {
				organizationId,
				id,
				timeZone: 'America/New_York',
			});
			expect(eastern).toEqual({
				lat: 35.5,
				lng: -90.5,
				requestDate: '2026-08-02',
				closedDate: '2026-08-20',
			});

			const utc = await getServiceRequestCenter(db, { organizationId, id, timeZone: 'UTC' });
			expect(utc?.closedDate).toBe('2026-08-21');
		});
	});

	it('reads no close day for an open request', async () => {
		await withTestDb(async ({ db }) => {
			const organizationId = await createOrganization(db);
			const id = await insertServiceRequest(db, organizationId, { closedAt: null });

			const center = await getServiceRequestCenter(db, {
				organizationId,
				id,
				timeZone: 'America/New_York',
			});
			expect(center?.requestDate).toBe('2026-08-02');
			expect(center?.closedDate).toBeNull();
		});
	});
});

describeDbIntegration('service-request nearby', () => {
	// One call exercises the full seven-branch union, so this validates the SQL
	// (columns, geography casts, ST_DWithin, date window) end-to-end even though
	// only habitats are seeded — Postgres plans every branch regardless of data.
	it('returns records within the radius and excludes those outside it', async () => {
		await withTestDb(async ({ db }) => {
			const organizationId = await createOrganization(db);

			// ~33 m north of the center — comfortably inside a 500 m radius.
			await db
				.insertInto('habitats')
				.values({
					organization_id: organizationId,
					geom: sql`st_setsrid(st_makepoint(-90.5, 35.5003), 4326)`,
					habitat_name: 'Near Pond',
					description: '',
					metadata: null,
				})
				.execute();
			// ~5 km north — outside the radius, must be excluded.
			await db
				.insertInto('habitats')
				.values({
					organization_id: organizationId,
					geom: sql`st_setsrid(st_makepoint(-90.5, 35.545), 4326)`,
					habitat_name: 'Far Pond',
					description: '',
					metadata: null,
				})
				.execute();

			const rows = await listNearbyRecords(db, {
				organizationId,
				center: { lat: 35.5, lng: -90.5 },
				radiusMeters: 500,
				dateFrom: '2026-07-01',
				dateTo: '2026-08-01',
				timeZone: 'America/New_York',
			});

			const habitats = rows.filter((row) => row.category === 'habitat');
			expect(habitats).toHaveLength(1);
			expect(habitats[0]?.label).toBe('Near Pond');
			expect(habitats[0]?.date).toBeNull();
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
					geom: sql`st_setsrid(st_makepoint(-90.5, 35.5003), 4326)`,
					collection_method_id: method.id,
					collection_timing_mode: 'exact_timestamps',
					started_at: new Date('2026-03-14T14:00:00.000Z'),
					collected_at: new Date('2026-03-16T02:30:00.000Z'),
				})
				.execute();

			const onTheFifteenth = async (timeZone: string) =>
				(
					await listNearbyRecords(db, {
						organizationId,
						center: { lat: 35.5, lng: -90.5 },
						radiusMeters: 500,
						dateFrom: '2026-03-15',
						dateTo: '2026-03-15',
						timeZone,
					})
				).filter((row) => row.category === 'collection');

			const eastern = await onTheFifteenth('America/New_York');
			expect(eastern).toHaveLength(1);
			expect(eastern[0]?.date).toBe('2026-03-15');

			expect(await onTheFifteenth('UTC')).toHaveLength(0);
		});
	});
});

/**
 * One request at the nearby suite's center, received on 2 August.
 *
 * The request date goes in at noon rather than midnight because the driver
 * serializes a `Date` in the client's zone, and a UTC midnight reaches a
 * `date` column as the day before anywhere west of Greenwich.
 */
async function insertServiceRequest(
	db: DbExecutor,
	organizationId: string,
	input: { readonly closedAt: Date | null },
): Promise<string> {
	const point = sql<string>`st_setsrid(st_makepoint(-90.5, 35.5), 4326)`;
	const address = await db
		.insertInto('addresses')
		.values({
			organization_id: organizationId,
			geom: point,
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
	const request = await db
		.insertInto('service_requests')
		.values({
			organization_id: organizationId,
			geom: point,
			request_date: new Date('2026-08-02T12:00:00'),
			address_id: address.id,
			contact_id: contact.id,
			closed_at: input.closedAt,
			details: 'Standing water behind the property.',
		})
		.returning(['id'])
		.executeTakeFirstOrThrow();
	return request.id;
}
