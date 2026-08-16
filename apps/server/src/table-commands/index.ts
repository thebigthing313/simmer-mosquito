/**
 * The `/commands/{table}` surface.
 *
 * Both surveillance domains, whole. The mechanism in `dispatch.ts` is
 * table-agnostic and the writers already exist per table, so adding one is its
 * own file of the shape `habitats.ts` has: a `run` config imported from the
 * domain module that already writes it, and a map from each command it accepts
 * to a builder.
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
import { collectionSpeciesTableCommands } from './collection-species.js';
import { collectionTableCommands } from './collections.js';
import { equipmentTableCommands, vehicleTableCommands } from './control-assets.js';
import {
	applicationMethodTableCommands,
	biocontrolMethodTableCommands,
	outreachMethodTableCommands,
	sourceReductionMethodTableCommands,
} from './control-methods.js';
import { registerTableCommandRoutes } from './dispatch.js';
import { habitatTableCommands } from './habitats.js';
import { inspectionTableCommands } from './inspections.js';
import { sampleSpeciesTableCommands } from './sample-species.js';
import { sampleTableCommands } from './samples.js';
import { trapTableCommands } from './traps.js';

export function registerTableCommandSurface(
	app: Hono<{ Variables: AuthVariables }>,
	options: {
		readonly db: CommandDb;
		readonly authContextMiddleware: MiddlewareHandler<{ Variables: AuthVariables }>;
	},
): void {
	registerTableCommandRoutes(app, options, habitatTableCommands(options.db));
	registerTableCommandRoutes(app, options, inspectionTableCommands(options.db));
	registerTableCommandRoutes(app, options, sampleTableCommands(options.db));
	registerTableCommandRoutes(app, options, sampleSpeciesTableCommands(options.db));
	registerTableCommandRoutes(app, options, trapTableCommands(options.db));
	registerTableCommandRoutes(app, options, collectionTableCommands(options.db));
	registerTableCommandRoutes(app, options, collectionSpeciesTableCommands(options.db));
	registerTableCommandRoutes(app, options, applicationMethodTableCommands(options.db));
	registerTableCommandRoutes(app, options, sourceReductionMethodTableCommands(options.db));
	registerTableCommandRoutes(app, options, outreachMethodTableCommands(options.db));
	registerTableCommandRoutes(app, options, biocontrolMethodTableCommands(options.db));
	registerTableCommandRoutes(app, options, vehicleTableCommands(options.db));
	registerTableCommandRoutes(app, options, equipmentTableCommands(options.db));
}
