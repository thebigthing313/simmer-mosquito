import {
	type DashboardResponse,
	getOrganizationSettingsRaw,
	readDashboard,
} from '@simmer-mosquito/db';
import { resolveOrganizationSettings } from '@simmer-mosquito/domain';
import type { Hono, MiddlewareHandler } from 'hono';
import type { AuthVariables } from './auth-middleware.js';
import type { CommandDb } from './command-write.js';

/**
 * The read behind `/`: every Dashboard panel the client cannot answer off a
 * synced table, in one round-trip.
 *
 * Beside `larval-surveillance-reads.ts`, and for the same reason: each of these
 * needs a second table to decide membership or a count over a window, which
 * the on-demand shapes cannot gather in one bounded request. `docs/dashboard-spec.md`
 * says which panels those are and why the rest read Electric.
 *
 * No query parameters. The Organization is the session's and today is the
 * server's, in the Organization's zone, so the strip's title and its counts
 * come from one clock. No role floor either: every role sees the page, the way
 * every role sees the overviews it links to.
 *
 * The response varies by the session's Organization and the URL carries no id,
 * so the path is on `PRIVATE_READ_PREFIXES` in `cache-headers.ts` and has a
 * `GET, OPTIONS` row in `cors-options.ts`.
 */
export function registerDashboardReadRoutes(
	app: Hono<{ Variables: AuthVariables }>,
	options: {
		readonly db: CommandDb;
		readonly authContextMiddleware: MiddlewareHandler<{ Variables: AuthVariables }>;
		/** The two reads, injectable so the route has an HTTP test with no database. */
		readonly readers?: Partial<DashboardReaders>;
	},
): void {
	const readers: DashboardReaders = { ...defaultDashboardReaders, ...options.readers };

	app.get('/dashboard', options.authContextMiddleware, async (context) => {
		const organizationId = context.get('authContext').organization.id;
		// Dates are the Organization's, not the database server's: which day a
		// reading or a request belongs to is decided in this zone.
		const timeZone = resolveOrganizationSettings(
			await readers.getOrganizationSettings(options.db, { organizationId }),
		).settings.timezone;

		const dashboard: DashboardResponse = await readers.readDashboard(options.db, {
			organizationId,
			timeZone,
		});
		return context.json(dashboard);
	});
}

export interface DashboardReaders {
	readonly getOrganizationSettings: typeof getOrganizationSettingsRaw;
	readonly readDashboard: typeof readDashboard;
}

const defaultDashboardReaders: DashboardReaders = {
	getOrganizationSettings: getOrganizationSettingsRaw,
	readDashboard,
};
