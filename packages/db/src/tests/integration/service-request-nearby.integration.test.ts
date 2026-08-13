import { expect, it } from 'vitest';
import { listNearbyRecords, sql } from '../../index.js';
import { describeDbIntegration, withTestDb } from '../../test-support/db-integration.js';

describeDbIntegration('service-request nearby', () => {
	// One call exercises the full seven-branch union, so this validates the SQL
	// (columns, geography casts, ST_DWithin, date window) end-to-end even though
	// only habitats are seeded — Postgres plans every branch regardless of data.
	it('returns records within the radius and excludes those outside it', async () => {
		await withTestDb(async ({ db }) => {
			const org = await db
				.insertInto('organizations')
				.values({ workos_organization_id: 'workos_org_nearby', name: 'Nearby District' })
				.returning(['id'])
				.executeTakeFirstOrThrow();

			// ~33 m north of the center — comfortably inside a 500 m radius.
			await db
				.insertInto('habitats')
				.values({
					organization_id: org.id,
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
					organization_id: org.id,
					geom: sql`st_setsrid(st_makepoint(-90.5, 35.545), 4326)`,
					habitat_name: 'Far Pond',
					description: '',
					metadata: null,
				})
				.execute();

			const rows = await listNearbyRecords(db, {
				organizationId: org.id,
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
	it('dates a collection by the agency’s day, not the database server’s', async () => {
		await withTestDb(async ({ db }) => {
			const org = await db
				.insertInto('organizations')
				.values({ workos_organization_id: 'workos_org_nearby_tz', name: 'Evening District' })
				.returning(['id'])
				.executeTakeFirstOrThrow();
			const method = await db
				.insertInto('collection_methods')
				.values({ organization_id: org.id, name: 'CDC light trap' })
				.returning(['id'])
				.executeTakeFirstOrThrow();

			// 10:30pm on 15 March in New York; 16 March in UTC.
			await db
				.insertInto('collections')
				.values({
					organization_id: org.id,
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
						organizationId: org.id,
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
