import { expect, it } from 'vitest';
import { createAddress, createSpatialFeature } from './index.js';
import { describeDbIntegration, withTestDb } from './test-support/db-integration.js';

describeDbIntegration('owned geometry columns', () => {
	it('backfills direct address geometry from the transitional feature id path', async () => {
		await withTestDb(async ({ db }) => {
			const organization = await db
				.insertInto('organizations')
				.values({
					workos_organization_id: 'workos_org_owned_geometry',
					name: 'Owned Geometry District',
				})
				.returning(['id'])
				.executeTakeFirstOrThrow();

			const feature = await createSpatialFeature(db, {
				geojson: { type: 'Point', coordinates: [-90.1234567, 35.7654321] },
				precisionPolicy: 'snap_5_decimal',
			});

			const address = await createAddress(db, {
				organizationId: organization.id,
				featureId: feature.id,
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
});
