/**
 * `/admin/*` is reads now, and this is the test that says so.
 *
 * The module served nine writes across three global catalogs — genera, species,
 * units — each calling a `*WithTxid` helper straight from a route, with no domain
 * command, no permission map entry and nobody the edit could be attributed to.
 * `/commands/{table}` serves all three behind the operator floor, so the nine are
 * gone.
 *
 * A stale caller has to get a 404 rather than a 405 or a silent success: two
 * doors on one table with different checks is exactly what retiring these
 * removed, and the way that regresses is somebody re-registering one. The
 * refusals these routes used to translate now live in
 * `table-commands/taxonomy.test.ts` and `table-commands/units.test.ts`.
 */

import { Hono } from 'hono';
import { createMiddleware } from 'hono/factory';
import { describe, expect, it, vi } from 'vitest';
import { registerAdminFoundationRoutes } from '../../admin-foundations.js';
import type { AuthVariables } from '../../auth-middleware.js';

// Nothing here touches the database: the two routes that remain are reads, and
// this suite only asks which routes exist.
vi.mock('@simmer-mosquito/db', () => ({}));

const ID = 'b0a5d1e8-6c1f-4a2b-9d3e-1f2a3b4c5d6e';

function createApp() {
	const app = new Hono<{ Variables: AuthVariables }>();
	registerAdminFoundationRoutes(app, {
		db: {} as never,
		operatorAuthContextMiddleware: createMiddleware(async (_context, next) => next()) as never,
	});
	return app;
}

describe('the retired global-catalog doors', () => {
	const gone = [
		{ method: 'POST', path: '/admin/genera' },
		{ method: 'PATCH', path: `/admin/genera/${ID}` },
		{ method: 'DELETE', path: `/admin/genera/${ID}` },
		{ method: 'POST', path: '/admin/species' },
		{ method: 'PATCH', path: `/admin/species/${ID}` },
		{ method: 'DELETE', path: `/admin/species/${ID}` },
		{ method: 'POST', path: '/admin/units' },
		{ method: 'PATCH', path: `/admin/units/${ID}` },
		{ method: 'DELETE', path: `/admin/units/${ID}` },
	];

	for (const { method, path } of gone) {
		it(`no longer answers ${method} ${path}`, async () => {
			const response = await createApp().request(path, { method });

			expect(response.status).toBe(404);
		});
	}

	it('registers no write verb at all', () => {
		// The stronger statement, and the one that catches a *new* write route
		// rather than a resurrected one. This module is reads.
		const verbs = new Set(
			createApp()
				.routes.filter((route) => route.method !== 'ALL')
				.map((route) => route.method),
		);

		expect([...verbs]).toEqual(['GET']);
	});
});
