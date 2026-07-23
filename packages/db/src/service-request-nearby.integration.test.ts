import { expect, it } from 'vitest';
import { listNearbyRecords, sql } from './index.js';
import { describeDbIntegration, withTestDb } from './test-support/db-integration.js';

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
			});

			const habitats = rows.filter((row) => row.category === 'habitat');
			expect(habitats).toHaveLength(1);
			expect(habitats[0]?.label).toBe('Near Pond');
			expect(habitats[0]?.date).toBeNull();
			expect(habitats[0]?.distanceMeters).toBeGreaterThan(0);
			expect(habitats[0]?.distanceMeters).toBeLessThan(500);
		});
	});
});
