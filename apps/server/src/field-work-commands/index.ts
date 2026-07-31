import type { Hono } from 'hono';
import type { AuthVariables } from '../auth-middleware.js';
import { registerAdditionalPersonnelRoutes } from './additional-personnel.js';
import { registerAssignmentItemRoutes } from './assignment-items.js';
import { registerAssignmentRoutes } from './assignments.js';
import { registerCommentRoutes } from './comments.js';
import { registerRouteItemRoutes } from './route-items.js';
import { registerRouteRoutes } from './routes.js';
import type { RouteOptions } from './shared.js';
import { registerTagItemRoutes } from './tag-items.js';

/**
 * Field-work command endpoints: comments, tag assignments, additional personnel,
 * routes (+ ordered route items), and assignments (+ ordered assignment items).
 *
 * Client issues plain optimistic POST/PATCH/DELETE per row; the server decomposes
 * each into the field-work domain command vocabulary. Ordered child rows
 * (route/assignment items) are reindexed on insert/move so the integer `position`
 * column stays contiguous. Assignment + item lifecycle transitions are derived
 * from the changed timestamp fields in a PATCH.
 */
export function registerFieldWorkCommandRoutes(
	app: Hono<{ Variables: AuthVariables }>,
	options: RouteOptions,
): void {
	registerCommentRoutes(app, options);
	registerTagItemRoutes(app, options);
	registerAdditionalPersonnelRoutes(app, options);
	registerRouteRoutes(app, options);
	registerRouteItemRoutes(app, options);
	registerAssignmentRoutes(app, options);
	registerAssignmentItemRoutes(app, options);
}
