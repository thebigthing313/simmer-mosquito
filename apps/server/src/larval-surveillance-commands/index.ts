import type { Hono, MiddlewareHandler } from 'hono';
import type { AuthVariables } from '../auth-middleware.js';
import { registerHabitatRoutes } from './habitats.js';
import { registerInspectionRoutes } from './inspections.js';
import { registerSampleReadRoutes } from './sample-reads.js';
import { registerSampleSpeciesRoutes } from './sample-species-counts.js';
import { registerSampleRoutes } from './samples.js';
import type { LarvalSurveillanceDb } from './shared.js';

/**
 * Larval surveillance command endpoints (habitats, inspections, samples,
 * sample-species counts). Like the adult-surveillance routes, the client issues
 * plain POST/PATCH/DELETE per row; the server decomposes each into the larval
 * domain command vocabulary and commits in a single Kysely transaction.
 *
 * Inspection result validation depends on the agency's larval inspection entry
 * policy, which lives in `organizations.settings` and is resolved per request.
 */
export function registerLarvalSurveillanceCommandRoutes(
	app: Hono<{ Variables: AuthVariables }>,
	options: {
		readonly db: LarvalSurveillanceDb;
		readonly authContextMiddleware: MiddlewareHandler<{ Variables: AuthVariables }>;
	},
): void {
	registerHabitatRoutes(app, options);
	registerInspectionRoutes(app, options);
	registerSampleRoutes(app, options);
	registerSampleReadRoutes(app, options);
	registerSampleSpeciesRoutes(app, options);
}
