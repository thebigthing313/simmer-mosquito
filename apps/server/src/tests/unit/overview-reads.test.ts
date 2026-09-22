import { OverviewPeriodInvalidError } from '@simmer-mosquito/db';
import type { OverviewResponse } from '@simmer-mosquito/domain';
import { Hono } from 'hono';
import { createMiddleware } from 'hono/factory';
import { describe, expect, it, vi } from 'vitest';
import type { AuthContext } from '../../auth-context.js';
import type { AuthVariables } from '../../auth-middleware.js';
import { registerOverviewReadRoutes } from '../../overview-reads.js';

/**
 * The contract `GET /overview/:grain` keeps with the three pages: the grain
 * is the path, the period rides in the param named for the page, the
 * Organization is the session's, the zone is the Organization's, and the body
 * is the reader's answer unchanged. The reader is covered against Postgres in
 * `packages/db`; this is the route around it.
 */
describe('GET /overview/:grain', () => {
	it('reads the session organization in its own zone at the grain and period asked for', async () => {
		const readOverview = vi.fn(async () => response);
		const app = createApp({ readOverview });

		const reply = await app.request('/overview/month?month=2026-08');

		expect(reply.status).toBe(200);
		expect(await reply.json()).toEqual(response);
		expect(readOverview).toHaveBeenCalledWith(expect.anything(), {
			organizationId,
			timeZone,
			grain: 'month',
			period: '2026-08',
		});
	});

	it('reads the current period when the param is absent, and by the param the grain owns', async () => {
		const readOverview = vi.fn(async (_db: unknown, _input: unknown) => response);
		const app = createApp({ readOverview });

		await app.request('/overview/day');
		await app.request('/overview/year?year=2024');
		// The wrong grain's param is not this grain's period.
		await app.request('/overview/day?month=2026-08');

		expect(readOverview.mock.calls.map((call) => call[1])).toEqual([
			expect.objectContaining({ grain: 'day', period: undefined }),
			expect.objectContaining({ grain: 'year', period: '2024' }),
			expect.objectContaining({ grain: 'day', period: undefined }),
		]);
	});

	it('answers 400 overview_period_invalid on a period the reader refuses', async () => {
		const readOverview = vi.fn(async () => {
			throw new OverviewPeriodInvalidError('day', '2026-13-40');
		});
		const app = createApp({ readOverview });

		const reply = await app.request('/overview/day?date=2026-13-40');

		expect(reply.status).toBe(400);
		expect(await reply.json()).toMatchObject({ error: 'overview_period_invalid' });
	});

	it('answers 404 on a grain that is not day, month or year', async () => {
		const readOverview = vi.fn(async () => response);
		const app = createApp({ readOverview });

		const reply = await app.request('/overview/today');

		expect(reply.status).toBe(404);
		expect(readOverview).not.toHaveBeenCalled();
	});

	it('refuses without a session', async () => {
		const readOverview = vi.fn(async () => response);
		const app = createApp({ readOverview, authenticated: false });

		const reply = await app.request('/overview/day');

		expect(reply.status).toBe(401);
		expect(readOverview).not.toHaveBeenCalled();
	});
});

const organizationId = 'f0dbf1c7-d278-441e-82b4-9292d390ce72';
// A zone with a real UTC offset, so a route that dropped it would show up as a
// missing field rather than pass on a value indistinguishable from the default.
const timeZone = 'America/New_York';

const authContext = { organization: { id: organizationId } } as AuthContext;

const response: OverviewResponse = {
	grain: 'month',
	period: '2026-08',
	today: '2026-09-15',
	cutThrough: null,
	earliest: '2011-04-02',
	columns: [
		{ key: 'period', from: '2026-08-01', to: '2026-08-31' },
		{ key: 'previous', from: '2026-07-01', to: '2026-07-31' },
		{ key: 'lastYear', from: '2025-08-01', to: '2025-08-31' },
		{ key: 'average', years: { from: 2021, to: 2025 } },
	],
	types: [],
	ratios: [],
};

function createApp(options: {
	readonly readOverview: (...args: never[]) => Promise<OverviewResponse>;
	readonly authenticated?: boolean;
}) {
	const app = new Hono<{ Variables: AuthVariables }>();
	registerOverviewReadRoutes(app, {
		db: {} as Parameters<typeof registerOverviewReadRoutes>[1]['db'],
		authContextMiddleware: createMiddleware(async (context, next) => {
			if (options.authenticated === false) {
				return context.json({ error: 'unauthenticated' }, 401);
			}
			context.set('authContext', authContext);
			await next();
		}),
		readers: {
			getOrganizationSettings: async () => ({ timezone: timeZone }),
			readOverview: options.readOverview as never,
		},
	});
	return app;
}
