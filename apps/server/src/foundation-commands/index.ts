import type { Hono, MiddlewareHandler } from 'hono';
import type { AuthVariables } from '../auth-middleware.js';
import { registerAddressRoutes } from './addresses.js';
import { registerOrgLookupRoutes } from './org-lookups.js';
import type { FoundationCommandDb, LookupCommandWriter, TagCommandWriter } from './shared.js';
import {
	registerTagRoutes,
	writeFoundationLookupCommand,
	writeFoundationTagCommand,
} from './tags.js';

/**
 * Foundation command endpoints: the organization address book plus the
 * org-scoped lookup catalogs (collection methods, collection lures, habitat
 * types) and tags.
 *
 * The lookup and tag writers stay injectable so tests can drive the handlers
 * without a database — one command's write at a time, since the transaction and
 * its ownership check belong to `writeCommands`.
 */
export function registerFoundationCommandRoutes(
	app: Hono<{ Variables: AuthVariables }>,
	options: {
		readonly db: FoundationCommandDb;
		readonly authContextMiddleware: MiddlewareHandler<{ Variables: AuthVariables }>;
		readonly writeLookupCommand?: LookupCommandWriter;
		readonly writeTagCommand?: TagCommandWriter;
	},
): void {
	registerAddressRoutes(app, options);
	registerOrgLookupRoutes(app, options, options.writeLookupCommand ?? writeFoundationLookupCommand);
	registerTagRoutes(app, options, options.writeTagCommand ?? writeFoundationTagCommand);
}
