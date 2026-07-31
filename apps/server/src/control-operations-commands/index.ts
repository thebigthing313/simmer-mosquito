import type { Hono, MiddlewareHandler } from 'hono';
import type { AuthVariables } from '../auth-middleware.js';
import { registerApplicationBatchRoutes } from './chemical-application-batches.js';
import { registerApplicationRoutes } from './chemical-applications.js';
import { registerFormulationInsecticideRoutes } from './formulation-insecticides.js';
import { registerFormulationRoutes } from './formulations.js';
import {
	biocontrolActionConfig,
	outreachActionConfig,
	registerActionRoutes,
	sourceReductionConfig,
} from './performed-actions.js';
import { registerRequestedControlActionRoutes } from './requested-control-actions.js';
import type { ControlOperationsDb } from './shared.js';

/**
 * Control operations command endpoints: formulations + formulation insecticides,
 * the four performed control-action types (chemical application, source
 * reduction, outreach, biocontrol) plus chemical-application batches, and
 * requested control actions.
 *
 * As with the surveillance slices the client issues plain optimistic
 * POST/PATCH/DELETE per row; the server decomposes each into the rich
 * control-operations domain command vocabulary. The domain `ControlActionContext`
 * (none/larval/adult) maps onto the habitat/inspection/collection columns.
 */
export function registerControlOperationsCommandRoutes(
	app: Hono<{ Variables: AuthVariables }>,
	options: {
		readonly db: ControlOperationsDb;
		readonly authContextMiddleware: MiddlewareHandler<{ Variables: AuthVariables }>;
	},
): void {
	registerFormulationRoutes(app, options);
	registerFormulationInsecticideRoutes(app, options);
	registerApplicationRoutes(app, options);
	registerApplicationBatchRoutes(app, options);
	registerActionRoutes(app, options, sourceReductionConfig);
	registerActionRoutes(app, options, outreachActionConfig);
	registerActionRoutes(app, options, biocontrolActionConfig);
	registerRequestedControlActionRoutes(app, options);
}
