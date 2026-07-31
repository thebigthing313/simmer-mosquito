import type { Hono } from 'hono';
import type { AuthVariables } from '../auth-middleware.js';
import { registerMissionItemRoutes } from './mission-items.js';
import { registerMissionRoutes } from './missions.js';
import type { RouteOptions } from './shared.js';

/**
 * Mission dispatch command endpoints: missions and their ordered mission items.
 *
 * Client issues plain optimistic POST/PATCH/DELETE per row; the server decomposes
 * each into the mission-dispatch domain command vocabulary. Mission and mission-
 * item lifecycle transitions are derived from changed timestamp fields in a PATCH;
 * mission items are reindexed on insert/move.
 *
 * NOTE: the cross-domain `record*ForMissionItem` commands (which create control
 * action records linked to a mission item) are intentionally not wired here —
 * control actions are written through their own control-operations collections.
 */
export function registerMissionDispatchCommandRoutes(
	app: Hono<{ Variables: AuthVariables }>,
	options: RouteOptions,
): void {
	registerMissionRoutes(app, options);
	registerMissionItemRoutes(app, options);
}
