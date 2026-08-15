/**
 * The `/commands/{table}` surface.
 *
 * One table so far. The mechanism in `dispatch.ts` is table-agnostic and the
 * writers already exist per table, so adding one is its own file of the shape
 * `habitats.ts` has: a `run` config imported from the domain module that already
 * writes it, and a map from each command it accepts to a builder.
 *
 * The remaining tables are mechanical but not automatic. Each builder is a
 * translation from column names to domain arguments, and the existing `build`
 * functions cannot be reused as they stand because they read camelCase and
 * reconstruct the command from which fields arrived — which is the thing these
 * routes exist to stop doing.
 *
 * These routes are additive. Nothing has moved off the existing command
 * endpoints, and both surfaces write through the same commands, permissions and
 * transaction, so a table served by both cannot disagree with itself.
 */

import type { Hono, MiddlewareHandler } from 'hono';
import type { AuthVariables } from '../auth-middleware.js';
import type { CommandDb } from '../command-write.js';
import { registerTableCommandRoutes } from './dispatch.js';
import { habitatTableCommands } from './habitats.js';

export function registerTableCommandSurface(
	app: Hono<{ Variables: AuthVariables }>,
	options: {
		readonly db: CommandDb;
		readonly authContextMiddleware: MiddlewareHandler<{ Variables: AuthVariables }>;
	},
): void {
	registerTableCommandRoutes(app, options, habitatTableCommands(options.db));
}
