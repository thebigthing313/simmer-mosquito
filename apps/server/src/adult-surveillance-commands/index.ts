import type { Hono, MiddlewareHandler } from 'hono';
import type { AuthVariables } from '../auth-middleware.js';
import { registerCollectionSpeciesRoutes } from './collection-species-counts.js';
import { registerCollectionRoutes } from './collections.js';
import type { AdultSurveillanceDb } from './shared.js';
import { registerTrapRoutes } from './traps.js';

/**
 * Adult surveillance command endpoints.
 *
 * The client issues plain optimistic POST/PATCH/DELETE per row; the server
 * decomposes each request into the rich adult-surveillance domain command
 * vocabulary (mirroring the control-asset command pattern) and commits the
 * resulting commands in a single Kysely transaction, returning the affected
 * row plus the Postgres transaction id Electric uses to confirm the mutation.
 */
export function registerAdultSurveillanceCommandRoutes(
	app: Hono<{ Variables: AuthVariables }>,
	options: {
		readonly db: AdultSurveillanceDb;
		readonly authContextMiddleware: MiddlewareHandler<{ Variables: AuthVariables }>;
	},
): void {
	registerTrapRoutes(app, options);
	registerCollectionRoutes(app, options);
	registerCollectionSpeciesRoutes(app, options);
}
