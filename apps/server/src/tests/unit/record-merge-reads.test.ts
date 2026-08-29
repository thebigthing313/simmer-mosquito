import { Hono } from 'hono';
import { createMiddleware } from 'hono/factory';
import { describe, expect, it } from 'vitest';
import type { AuthContext } from '../../auth-context.js';
import type { AuthVariables } from '../../auth-middleware.js';
import { registerRecordMergeReadRoutes } from '../../record-merge-reads.js';

/**
 * What the two merge reads refuse before they reach the database.
 *
 * `record-duplicates.integration.test.ts` in `packages/db` proves what the SQL
 * proposes and `record-merge-reads.integration.test.ts` proves what the routes
 * answer over real rows. This file covers the refusals in front of both, and the
 * database it is given throws when touched, so a passing test also proves the
 * refusal happened here rather than in a query that found nothing.
 *
 * Worth its own file because both routes take caller-supplied ids into a
 * `::uuid[]` cast. A malformed id that gets that far is a driver error, which
 * reaches the client as a 500 with nothing in it to act on.
 */
describe('GET /records/:recordType/duplicates', () => {
	it('answers 404 for a record type that cannot be merged', async () => {
		const response = await app().request('/records/sprocket/duplicates');

		expect(response.status).toBe(404);
		await expect(response.json()).resolves.toMatchObject({
			error: 'unknown_record_type',
			reason: 'sprocket cannot be merged.',
		});
	});

	it('refuses a record type that is deletable but not mergeable', async () => {
		// A trap has a delete policy and no merge policy. The two registries are
		// different sets and these routes sit under the same `/records` prefix as
		// `delete-impact`, so checking the wrong one would answer here and then 500
		// on the merge itself.
		const response = await app().request('/records/trap/duplicates');

		expect(response.status).toBe(404);
	});
});

const organizationId = '33333333-3333-4333-8333-333333333333';

function app() {
	const instance = new Hono<{ Variables: AuthVariables }>();
	registerRecordMergeReadRoutes(instance, {
		db: unusableDb(),
		authContextMiddleware: stubAuthContext,
	});
	return instance;
}

/** A database that fails the test rather than answering it. */
function unusableDb() {
	return new Proxy(
		{},
		{
			get() {
				throw new Error('The route touched the database.');
			},
		},
	) as never;
}

const stubAuthContext = createMiddleware<{ Variables: AuthVariables }>(async (context, next) => {
	context.set('authContext', { organization: { id: organizationId } } as AuthContext);
	await next();
});
