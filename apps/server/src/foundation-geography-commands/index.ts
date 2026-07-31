import type { Hono } from 'hono';
import type { AuthVariables } from '../auth-middleware.js';
import { registerOrganizationSpeciesRoutes } from './organization-species.js';
import { registerRegionFolderRoutes } from './region-folders.js';
import { registerRegionRoutes } from './regions.js';
import type { RouteOptions } from './shared.js';

/**
 * Foundation geography + agency taxonomy command endpoints: region folders,
 * regions (with polygon geometry), and organization-species selection.
 * (Addresses and org lookup tables are handled in foundation-commands.ts;
 * global genera/species taxonomy is operator-owned, not part of the agency
 * command surface.)
 *
 * Region geometry is not part of the synced row, so it travels through the
 * mutation `metadata.geometry` channel; the region PATCH derives detail / folder
 * / geometry changes from the fields present.
 */
export function registerFoundationGeographyCommandRoutes(
	app: Hono<{ Variables: AuthVariables }>,
	options: RouteOptions,
): void {
	registerRegionFolderRoutes(app, options);
	registerRegionRoutes(app, options);
	registerOrganizationSpeciesRoutes(app, options);
}
