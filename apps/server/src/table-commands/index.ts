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
import { addressTableCommands } from './addresses.js';
import { applicationBatchTableCommands, applicationTableCommands } from './applications.js';
import { collectionSpeciesTableCommands } from './collection-species.js';
import { collectionTableCommands } from './collections.js';
import { contactTableCommands, serviceRequestTableCommands } from './contacts.js';
import { equipmentTableCommands, vehicleTableCommands } from './control-assets.js';
import {
	applicationMethodTableCommands,
	biocontrolMethodTableCommands,
	outreachMethodTableCommands,
	sourceReductionMethodTableCommands,
} from './control-methods.js';
import {
	formulationInsecticideTableCommands,
	formulationTableCommands,
	insecticideBatchTableCommands,
	insecticideTableCommands,
} from './control-products.js';
import { registerTableCommandRoutes } from './dispatch.js';
import { habitatTableCommands } from './habitats.js';
import { inspectionTableCommands } from './inspections.js';
import {
	missionNotificationTableCommands,
	notificationRegistrationTableCommands,
	notificationRegistrationTypeTableCommands,
	notificationTypeTableCommands,
} from './notifications.js';
import {
	collectionLureTableCommands,
	collectionMethodTableCommands,
	habitatTypeTableCommands,
} from './org-lookups.js';
import { organizationSpeciesTableCommands } from './organization-species.js';
import {
	biocontrolActionTableCommands,
	outreachActionTableCommands,
	sourceReductionTableCommands,
} from './performed-actions.js';
import { regionFolderTableCommands, regionTableCommands } from './regions.js';
import { requestedControlActionTableCommands } from './requested-control-actions.js';
import { sampleSpeciesTableCommands } from './sample-species.js';
import { sampleTableCommands } from './samples.js';
import { genusTableCommands, speciesTableCommands } from './taxonomy.js';
import { trapTableCommands } from './traps.js';
import { unitTableCommands } from './units.js';

export function registerTableCommandSurface(
	app: Hono<{ Variables: AuthVariables }>,
	options: {
		readonly db: CommandDb;
		readonly authContextMiddleware: MiddlewareHandler<{ Variables: AuthVariables }>;
		/** Required only by the global catalogs — see `taxonomy.ts`. */
		readonly operatorAuthContextMiddleware: MiddlewareHandler<{ Variables: AuthVariables }>;
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
	registerTableCommandRoutes(app, options, sourceReductionTableCommands(options.db));
	registerTableCommandRoutes(app, options, outreachActionTableCommands(options.db));
	registerTableCommandRoutes(app, options, biocontrolActionTableCommands(options.db));
	registerTableCommandRoutes(app, options, requestedControlActionTableCommands(options.db));
	registerTableCommandRoutes(app, options, applicationTableCommands(options.db));
	registerTableCommandRoutes(app, options, applicationBatchTableCommands(options.db));
	registerTableCommandRoutes(app, options, insecticideTableCommands(options.db));
	registerTableCommandRoutes(app, options, insecticideBatchTableCommands(options.db));
	registerTableCommandRoutes(app, options, formulationTableCommands(options.db));
	registerTableCommandRoutes(app, options, formulationInsecticideTableCommands(options.db));
	registerTableCommandRoutes(app, options, contactTableCommands(options.db));
	registerTableCommandRoutes(app, options, serviceRequestTableCommands(options.db));
	registerTableCommandRoutes(app, options, notificationTypeTableCommands(options.db));
	registerTableCommandRoutes(app, options, notificationRegistrationTableCommands(options.db));
	registerTableCommandRoutes(app, options, notificationRegistrationTypeTableCommands(options.db));
	registerTableCommandRoutes(app, options, missionNotificationTableCommands(options.db));
	registerTableCommandRoutes(app, options, collectionMethodTableCommands(options.db));
	registerTableCommandRoutes(app, options, collectionLureTableCommands(options.db));
	registerTableCommandRoutes(app, options, habitatTypeTableCommands(options.db));
	registerTableCommandRoutes(app, options, regionFolderTableCommands(options.db));
	registerTableCommandRoutes(app, options, regionTableCommands(options.db));
	registerTableCommandRoutes(app, options, organizationSpeciesTableCommands(options.db));
	registerTableCommandRoutes(app, options, addressTableCommands(options.db));
	// The three global catalogs, behind the operator door.
	registerTableCommandRoutes(app, options, genusTableCommands(options.db));
	registerTableCommandRoutes(app, options, speciesTableCommands(options.db));
	registerTableCommandRoutes(app, options, unitTableCommands(options.db));
}
