import { listSamplesAwaitingIdentification } from '@simmer-mosquito/db';
import type { Hono, MiddlewareHandler } from 'hono';
import type { AuthVariables } from '../auth-middleware.js';
import type { LarvalSurveillanceDb } from './shared.js';

const defaultAwaitingLimit = 6;
const maxAwaitingLimit = 50;
const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Read side for the larval overview: samples awaiting identification within a
 * recent window. This is a cross-habitat rollup that the on-demand sync shapes
 * don't serve well (a nested include would fan out over every inspection in the
 * window), so it resolves server-side in one authorized query.
 */
export function registerSampleReadRoutes(
	app: Hono<{ Variables: AuthVariables }>,
	options: {
		readonly db: LarvalSurveillanceDb;
		readonly authContextMiddleware: MiddlewareHandler<{ Variables: AuthVariables }>;
	},
): void {
	app.get(
		'/larval-surveillance/samples/awaiting',
		options.authContextMiddleware,
		async (context) => {
			const searchParams = new URL(context.req.url).searchParams;

			const since = searchParams.get('since');
			if (since === null || !isoDatePattern.test(since)) {
				return context.json(
					{ error: 'invalid_query', reason: 'since must be a YYYY-MM-DD date.' },
					400,
				);
			}

			const rawLimit = searchParams.get('limit');
			let limit = defaultAwaitingLimit;
			if (rawLimit !== null && rawLimit.trim() !== '') {
				const parsed = Number.parseInt(rawLimit, 10);
				if (!Number.isInteger(parsed) || parsed < 1 || parsed > maxAwaitingLimit) {
					return context.json(
						{ error: 'invalid_query', reason: `limit must be between 1 and ${maxAwaitingLimit}.` },
						400,
					);
				}
				limit = parsed;
			}

			const authContext = context.get('authContext');
			const result = await listSamplesAwaitingIdentification(options.db, {
				organizationId: authContext.organization.id,
				since,
				limit,
			});

			return context.json(result);
		},
	);
}
