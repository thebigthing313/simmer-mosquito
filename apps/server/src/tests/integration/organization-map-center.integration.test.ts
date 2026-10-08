import { type Kysely, type SimmerDatabase, sql } from '@simmer-mosquito/db';
import {
	createActingOrganization,
	describeDbIntegration,
	withTestDb,
} from '@simmer-mosquito/db/test-support';
import { expect, it } from 'vitest';
import { command, commandApp } from './support/command-app.js';

/**
 * The Organization's map centre, written through `/commands/organizations` and
 * read back (#1413).
 *
 * The client geocodes the mailing address and sends the top result in the same
 * write, so the two columns arrive beside the address and nowhere else. The
 * refusals assert the row is untouched as well as the status, because a write
 * that refused the centre and kept the address would store an address whose
 * centre is somewhere else.
 */
describeDbIntegration('organization map centre', () => {
	it('stores the centre beside the address it was geocoded from', async () => {
		await withTestDb(async ({ db }) => {
			const { organizationId: org, actorProfileId: actor } = await createActingOrganization(db);

			const response = await commandApp(db, org, actor).request(
				`/commands/organizations/${org}`,
				command('PATCH', ['identity.updateOrganizationDetails'], {
					mailing_postal_code: '08901',
					map_center_lat: 40.4862,
					map_center_lng: -74.4518,
				}),
			);

			expect(response.status).toBe(200);
			await expect(readCentre(db, org)).resolves.toEqual({
				mailing_postal_code: '08901',
				map_center_lat: 40.4862,
				map_center_lng: -74.4518,
			});
		});
	});

	it('clears the centre when both halves are sent as null', async () => {
		await withTestDb(async ({ db }) => {
			const { organizationId: org, actorProfileId: actor } = await createActingOrganization(db, {
				organization: { map_center_lat: 40.4862, map_center_lng: -74.4518 },
			});

			const response = await commandApp(db, org, actor).request(
				`/commands/organizations/${org}`,
				command('PATCH', ['identity.updateOrganizationDetails'], {
					map_center_lat: null,
					map_center_lng: null,
				}),
			);

			expect(response.status).toBe(200);
			await expect(readCentre(db, org)).resolves.toMatchObject({
				map_center_lat: null,
				map_center_lng: null,
			});
		});
	});

	it.each([
		['a latitude outside -90..90', { map_center_lat: 90.5, map_center_lng: -74.4518 }],
		['a longitude outside -180..180', { map_center_lat: 40.4862, map_center_lng: -180.5 }],
	])('refuses %s and writes nothing', async (_label, centre) => {
		await withTestDb(async ({ db }) => {
			const { organizationId: org, actorProfileId: actor } = await createActingOrganization(db);

			const response = await commandApp(db, org, actor).request(
				`/commands/organizations/${org}`,
				command('PATCH', ['identity.updateOrganizationDetails'], {
					mailing_postal_code: '08901',
					...centre,
				}),
			);

			expect(response.status).toBe(400);
			await expect(readCentre(db, org)).resolves.toEqual({
				mailing_postal_code: null,
				map_center_lat: null,
				map_center_lng: null,
			});
		});
	});

	it('moves one half alone on a row that has a centre', async () => {
		await withTestDb(async ({ db }) => {
			const { organizationId: org, actorProfileId: actor } = await createActingOrganization(db, {
				organization: { map_center_lat: 40.4862, map_center_lng: -74.4518 },
			});

			// What the client sends when a new geocode lands on the stored latitude:
			// the library diffs the row and the unchanged half drops out of the body.
			const response = await commandApp(db, org, actor).request(
				`/commands/organizations/${org}`,
				command('PATCH', ['identity.updateOrganizationDetails'], { map_center_lng: -74.5 }),
			);

			expect(response.status).toBe(200);
			await expect(readCentre(db, org)).resolves.toMatchObject({
				map_center_lat: 40.4862,
				map_center_lng: -74.5,
			});
		});
	});

	it('refuses half a centre on a row with none at the column', async () => {
		await withTestDb(async ({ db }) => {
			const { organizationId: org } = await createActingOrganization(db);

			await expect(
				sql`update organizations set map_center_lat = 40 where id = ${org}`.execute(db),
			).rejects.toThrow(/organizations_map_center_pair/);
		});
	});
});

async function readCentre(db: Kysely<SimmerDatabase>, organizationId: string) {
	return db
		.selectFrom('organizations')
		.select(['mailing_postal_code', 'map_center_lat', 'map_center_lng'])
		.where('id', '=', organizationId)
		.executeTakeFirstOrThrow();
}
