import type { Hono, MiddlewareHandler } from 'hono';
import type { AuthVariables } from '../auth-middleware.js';
import { registerAddressRoutes } from './addresses.js';
import { registerCollectionLureRoutes } from './collection-lures.js';
import { registerCollectionMethodRoutes } from './collection-methods.js';
import { registerHabitatTypeRoutes } from './habitat-types.js';
import type {
	CollectionMethodCommandWriter,
	FoundationCommandDb,
	TagCommandWriter,
} from './shared.js';
import {
	registerTagRoutes,
	writeFoundationLookupCommands,
	writeFoundationTagCommands,
} from './tags.js';

/**
 * Foundation command endpoints: the agency address book plus the org-scoped
 * lookup tables (collection methods, collection lures, habitat types) and tags.
 *
 * Each entity group registers its own routes; the lookup and tag writers stay
 * injectable so tests can drive the handlers without a database.
 */
export function registerFoundationCommandRoutes(
	app: Hono<{ Variables: AuthVariables }>,
	options: {
		readonly db: FoundationCommandDb;
		readonly authContextMiddleware: MiddlewareHandler<{ Variables: AuthVariables }>;
		readonly writeCollectionMethodCommands?: CollectionMethodCommandWriter;
		readonly writeTagCommands?: TagCommandWriter;
	},
): void {
	const writeCollectionMethodCommands =
		options.writeCollectionMethodCommands ?? writeFoundationLookupCommands;
	const writeTagCommands = options.writeTagCommands ?? writeFoundationTagCommands;

	registerAddressRoutes(app, options);
	registerCollectionMethodRoutes(app, options, writeCollectionMethodCommands);
	registerCollectionLureRoutes(app, options, writeCollectionMethodCommands);
	registerHabitatTypeRoutes(app, options, writeCollectionMethodCommands);
	registerTagRoutes(app, options, writeTagCommands);
}
