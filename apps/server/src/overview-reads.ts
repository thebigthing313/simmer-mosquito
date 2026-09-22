import {
	getOrganizationSettingsRaw,
	OverviewPeriodInvalidError,
	readOverview,
} from '@simmer-mosquito/db';
import {
	isOverviewGrain,
	OVERVIEW_PERIOD_PARAM,
	type OverviewResponse,
	resolveOrganizationSettings,
} from '@simmer-mosquito/domain';
import type { Hono, MiddlewareHandler } from 'hono';
import type { AuthVariables } from './auth-middleware.js';
import type { CommandDb } from './command-write.js';

/**
 * The read behind Today, Monthly and Annual: `GET /overview/:grain`, one
 * endpoint for the three period-in-review pages. `docs/today-spec.md` is the
 * brief and `packages/db/src/domains/overview.ts` is the reader.
 *
 * Beside `dashboard-reads.ts`, and shaped like it: the Organization is the
 * session's, today is the server's in the Organization's zone, and there is
 * no role floor, because every role sees the page. The grain is in the path
 * and the period rides in the param named for the page, `date`, `month` or
 * `year`, absent for the current period. A malformed or future period is 400
 * `overview_period_invalid`, since the client rewrites both before asking; a
 * period before the earliest record is legal and answers zeros; an unknown
 * grain is 404.
 *
 * The response varies by the session's Organization and the URL carries no
 * id, so `/overview/*` is on `PRIVATE_READ_PREFIXES` in `cache-headers.ts`
 * and has a `GET, OPTIONS` row in `cors-options.ts`.
 */
export function registerOverviewReadRoutes(
	app: Hono<{ Variables: AuthVariables }>,
	options: {
		readonly db: CommandDb;
		readonly authContextMiddleware: MiddlewareHandler<{ Variables: AuthVariables }>;
		/** The two reads, injectable so the route has an HTTP test with no database. */
		readonly readers?: Partial<OverviewReaders>;
	},
): void {
	const readers: OverviewReaders = { ...defaultOverviewReaders, ...options.readers };

	app.get('/overview/:grain', options.authContextMiddleware, async (context) => {
		const grain = context.req.param('grain');
		if (!isOverviewGrain(grain)) {
			return context.json({ error: 'not_found', reason: `No overview grain ${grain}.` }, 404);
		}
		const organizationId = context.get('authContext').organization.id;
		// Dates are the Organization's, not the database server's: which day a
		// record belongs to is decided in this zone.
		const timeZone = resolveOrganizationSettings(
			await readers.getOrganizationSettings(options.db, { organizationId }),
		).settings.timezone;

		try {
			const overview: OverviewResponse = await readers.readOverview(options.db, {
				organizationId,
				timeZone,
				grain,
				period: context.req.query(OVERVIEW_PERIOD_PARAM[grain]),
			});
			return context.json(overview);
		} catch (error) {
			if (error instanceof OverviewPeriodInvalidError) {
				return context.json({ error: 'overview_period_invalid', reason: error.message }, 400);
			}
			throw error;
		}
	});
}

export interface OverviewReaders {
	readonly getOrganizationSettings: typeof getOrganizationSettingsRaw;
	readonly readOverview: typeof readOverview;
}

const defaultOverviewReaders: OverviewReaders = {
	getOrganizationSettings: getOrganizationSettingsRaw,
	readOverview,
};
