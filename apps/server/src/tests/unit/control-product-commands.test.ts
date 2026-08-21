import type { SimmerRole } from '@simmer-mosquito/db';
import { createCompileOnlyDb } from '@simmer-mosquito/db/test-support';
import { Hono } from 'hono';
import { createMiddleware } from 'hono/factory';
import { describe, expect, it } from 'vitest';
import type { AuthContext } from '../../auth-context.js';
import type { AuthVariables } from '../../auth-middleware.js';
import { registerControlProductCommandRoutes } from '../../control-product-commands.js';

/**
 * The bug (#119): `POST /control-products/insecticide-batches` with an
 * `insecticideId` belonging to another agency answered **500**.
 *
 * `createInsecticideBatch` refuses that id from inside
 * `db.transaction().execute`, and no route in this file had a `catch`, so the
 * throw reached Hono as an unhandled error. Every folder-family endpoint
 * answers the same case as a typed 4xx.
 *
 * `DummyDriver` is what makes this a fast test rather than an integration one:
 * it compiles the real queries and returns no rows for every one of them, which
 * is exactly the state a cross-tenant id produces — the ownership `select`
 * finds nothing. It cannot prove the *predicate* is right (that needs Postgres,
 * and `command-authorization.integration.test.ts` argues the point), but the
 * predicate is not what regressed here. The error mapping is.
 */
describe('insecticide batch writes against an insecticide the agency does not own', () => {
	it('answers 404, not 500, when the insecticide id resolves to nothing', async () => {
		const response = await postBatch('admin', {
			id: '9c2f1a70-4d31-4d61-9a7b-6b0d5d2a1f31',
			insecticideId: 'b1d4e5a2-0f63-4c8e-9f21-3a8c7e4b2d90',
			batchName: 'Lot 22-A',
		});

		expect(response.status).toBe(404);
		// `catalog_reference_refused` since #123: the bespoke check this batch
		// writer carried became the shared catalog gate, which every writer that
		// names a catalog now runs. The status and the reasoning are unchanged.
		await expect(response.json()).resolves.toMatchObject({
			error: 'catalog_reference_refused',
			reason: 'missing',
			catalog: 'insecticide',
		});
	});

	// The cases answer alike on purpose. A refusal that distinguished "another
	// agency's insecticide" from "no such insecticide" would let a caller probe
	// for ids across tenants — the same argument `readAssigneeOwnership` makes
	// for collapsing `elsewhere` and `deleted` into one `missing`.
	it('answers a foreign id and an unknown id identically', async () => {
		const foreign = await postBatch('admin', {
			id: '2b7c9e41-5a82-4f13-b6d0-8e1f4c3a7b52',
			insecticideId: 'b1d4e5a2-0f63-4c8e-9f21-3a8c7e4b2d90',
			batchName: 'Lot 22-B',
		});
		const unknown = await postBatch('admin', {
			id: '2b7c9e41-5a82-4f13-b6d0-8e1f4c3a7b52',
			insecticideId: '00000000-0000-4000-8000-000000000000',
			batchName: 'Lot 22-B',
		});

		expect(foreign.status).toBe(unknown.status);
		await expect(foreign.json()).resolves.toEqual(await unknown.json());
	});

	// The floor still applies, and still applies first: a collector is refused
	// before the write opens a transaction at all.
	it('refuses a collector below the manager floor', async () => {
		const response = await postBatch('collector', {
			id: '4e9a1c63-7b20-4d95-8f42-1c6b8d5e3a74',
			insecticideId: 'b1d4e5a2-0f63-4c8e-9f21-3a8c7e4b2d90',
			batchName: 'Lot 22-C',
		});

		expect(response.status).toBe(403);
	});
});

async function postBatch(role: SimmerRole, body: unknown): Promise<Response> {
	const app = new Hono<{ Variables: AuthVariables }>();
	registerControlProductCommandRoutes(app, {
		db: createCompileOnlyDb(),
		authContextMiddleware: createMiddleware<{ Variables: AuthVariables }>(async (context, next) => {
			context.set('authContext', authContextFor(role));
			await next();
		}),
	});

	return app.request('/control-products/insecticide-batches', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body),
	});
}

function authContextFor(role: SimmerRole): AuthContext {
	return {
		organization: { id: 'f0dbf1c7-d278-441e-82b4-9292d390ce72' },
		profile: { id: '0105b111-e0be-46b0-b5e9-a87507889b51' },
		role,
	} as AuthContext;
}
