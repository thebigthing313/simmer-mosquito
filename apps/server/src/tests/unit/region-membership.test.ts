import { Hono } from 'hono';
import { createMiddleware } from 'hono/factory';
import { describe, expect, it } from 'vitest';
import type { AuthContext } from '../../auth-context.js';
import type { AuthVariables } from '../../auth-middleware.js';
import { registerRegionMembershipRoutes } from '../../region-membership.js';

/**
 * The regions endpoint at the HTTP boundary.
 *
 * The predicate is proved against Postgres by the corpus in `packages/db`, and
 * the tenancy answers by `region-membership.integration.test.ts` next door. What
 * neither can reach is what the route does with a record type it has never heard
 * of, which is the one case that must not be a `found: false`.
 */
describe('GET /records/:recordType/:recordId/regions', () => {
	it('answers 404 for a table that carries no geometry', async () => {
		const response = await app().request(`/records/samples/${recordId}/regions`);

		expect(response.status).toBe(404);
		await expect(response.json()).resolves.toMatchObject({ error: 'unknown_record_type' });
	});

	it('refuses an unknown record type without opening the database', async () => {
		// The database throws if touched, so a pass also proves the 404 comes from
		// the whitelist rather than from a lookup that found nothing. Those are
		// different answers, and one of them is slower.
		const response = await app().request(`/records/sprocket/${recordId}/regions`);

		expect(response.status).toBe(404);
	});

	it('names the type it did not recognise', async () => {
		const response = await app().request(`/records/sprocket/${recordId}/regions`);

		await expect(response.json()).resolves.toMatchObject({
			reason: 'sprocket carries no geometry.',
		});
	});
});

const recordId = 'b7c2f0a4-6f0e-4c39-9f1e-6a4a4b7c9d21';
const organizationId = 'f0dbf1c7-d278-441e-82b4-9292d390ce72';

function app(): Hono<{ Variables: AuthVariables }> {
	const instance = new Hono<{ Variables: AuthVariables }>();
	registerRegionMembershipRoutes(instance, {
		db: unusableDb as never,
		authContextMiddleware: createMiddleware<{ Variables: AuthVariables }>(async (context, next) => {
			context.set('authContext', {
				organization: { id: organizationId },
				profile: { id: '0105b111-e0be-46b0-b5e9-a87507889b51' },
				role: 'owner',
			} as AuthContext);
			await next();
		}),
	});
	return instance;
}

const unusableDb = {
	selectFrom: () => {
		throw new Error('The database must not be reached for an unknown record type.');
	},
};
