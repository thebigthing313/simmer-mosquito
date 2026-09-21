import type { DashboardResponse } from '@simmer-mosquito/db';
import { Hono } from 'hono';
import { createMiddleware } from 'hono/factory';
import { describe, expect, it, vi } from 'vitest';
import type { AuthContext } from '../../auth-context.js';
import type { AuthVariables } from '../../auth-middleware.js';
import { registerDashboardReadRoutes } from '../../dashboard-reads.js';

/**
 * The contract `GET /dashboard` keeps with the page: the Organization is the
 * session's, the zone is the Organization's, and the body is the reader's
 * answer unchanged. The reader itself is covered against Postgres in
 * `packages/db`; this is the route around it.
 */
describe('GET /dashboard', () => {
	it('reads the session organization in its own zone and answers with the sections', async () => {
		const readDashboard = vi.fn(async () => response);
		const app = createApp({ readDashboard });

		const reply = await app.request('/dashboard');

		expect(reply.status).toBe(200);
		expect(await reply.json()).toEqual(response);
		expect(readDashboard).toHaveBeenCalledWith(expect.anything(), { organizationId, timeZone });
	});

	it('refuses without a session', async () => {
		const readDashboard = vi.fn();
		const app = createApp({ readDashboard, authenticated: false });

		const reply = await app.request('/dashboard');

		expect(reply.status).toBe(401);
		expect(readDashboard).not.toHaveBeenCalled();
	});
});

const organizationId = 'f0dbf1c7-d278-441e-82b4-9292d390ce72';
// A zone with a real UTC offset, so a route that dropped it would show up as a
// missing field rather than pass on a value indistinguishable from the default.
const timeZone = 'America/New_York';

const authContext = { organization: { id: organizationId } } as AuthContext;

const response: DashboardResponse = {
	today: '2026-09-15',
	queues: {
		samplesAwaiting: { count: 3, oldest: '2026-08-16' },
		collectionsAwaiting: { count: 0, oldest: null },
		requestsUnassigned: { count: 1, oldest: '2026-09-11' },
	},
};

function createApp(options: {
	readonly readDashboard: (...args: never[]) => Promise<DashboardResponse>;
	readonly authenticated?: boolean;
}) {
	const app = new Hono<{ Variables: AuthVariables }>();
	registerDashboardReadRoutes(app, {
		db: {} as Parameters<typeof registerDashboardReadRoutes>[1]['db'],
		authContextMiddleware: createMiddleware(async (context, next) => {
			if (options.authenticated === false) {
				return context.json({ error: 'unauthenticated' }, 401);
			}
			context.set('authContext', authContext);
			await next();
		}),
		readers: {
			getOrganizationSettings: async () => ({ timezone: timeZone }),
			readDashboard: options.readDashboard as never,
		},
	});
	return app;
}
