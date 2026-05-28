import { expect, it } from 'vitest';
import { createAddress, listHabitatDisplayRowsByBounds, sql } from './index.js';
import { describeDbIntegration, withTestDb } from './test-support/db-integration.js';

describeDbIntegration('owned geometry columns', () => {
	it('stores direct address geometry without spatial feature indirection', async () => {
		await withTestDb(async ({ db }) => {
			const organization = await db
				.insertInto('organizations')
				.values({
					workos_organization_id: 'workos_org_owned_geometry',
					name: 'Owned Geometry District',
				})
				.returning(['id'])
				.executeTakeFirstOrThrow();

			const address = await createAddress(db, {
				organizationId: organization.id,
				geojson: { type: 'Point', coordinates: [-90.1234567, 35.7654321] },
				displayName: 'Field Office',
				country: 'US',
			});

			const row = await db
				.selectFrom('addresses')
				.select(['geojson', 'geom_type', 'lat', 'lng'])
				.where('id', '=', address.id)
				.executeTakeFirstOrThrow();

			expect(row.geojson).toEqual({ type: 'Point', coordinates: [-90.1234567, 35.7654321] });
			expect(row.geom_type).toBe('st_point');
			expect(row.lat).toBeCloseTo(35.7654321);
			expect(row.lng).toBeCloseTo(-90.1234567);
		});
	});

	it('lists habitat display rows with unnamed habitats ordered by uuid fallback', async () => {
		await withTestDb(async ({ db }) => {
			const organization = await db
				.insertInto('organizations')
				.values({
					workos_organization_id: 'workos_org_habitat_display',
					name: 'Habitat Display District',
				})
				.returning(['id'])
				.executeTakeFirstOrThrow();

			await db
				.insertInto('habitats')
				.values({
					organization_id: organization.id,
					geom: sql`st_setsrid(st_makepoint(-90.5, 35.5), 4326)`,
					habitat_name: null,
					description: '',
					metadata: null,
				})
				.execute();

			const rows = await listHabitatDisplayRowsByBounds(db, {
				organizationId: organization.id,
				bounds: {
					west: -91,
					south: 35,
					east: -90,
					north: 36,
				},
				limit: 50,
			});

			expect(rows).toHaveLength(1);
			expect(rows[0]).toMatchObject({
				organizationId: organization.id,
				habitatName: null,
				geomType: 'st_point',
			});
		});
	});
});
