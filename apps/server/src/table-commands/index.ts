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
import { additionalPersonnelTableCommands } from './additional-personnel.js';
import { addressTableCommands } from './addresses.js';
import { applicationBatchTableCommands, applicationTableCommands } from './applications.js';
import { assignmentItemTableCommands } from './assignment-items.js';
import { assignmentTableCommands } from './assignments.js';
import { collectionSpeciesTableCommands } from './collection-species.js';
import { collectionTableCommands } from './collections.js';
import { commentTableCommands } from './comments.js';
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
import { type AnyTableCommands, registerTableCommandRoutes } from './dispatch.js';
import { habitatTableCommands } from './habitats.js';
import { inspectionTableCommands } from './inspections.js';
import { missionItemTableCommands } from './mission-items.js';
import { missionTableCommands } from './missions.js';
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
import { routeItemTableCommands } from './route-items.js';
import { routeTableCommands } from './routes.js';
import { sampleSpeciesTableCommands } from './sample-species.js';
import { sampleTableCommands } from './samples.js';
import { tagItemTableCommands } from './tag-items.js';
import { genusTableCommands, speciesTableCommands } from './taxonomy.js';
import { trapTableCommands } from './traps.js';
import { unitTableCommands } from './units.js';

/**
 * Every table on the surface, as data.
 *
 * A list rather than a sequence of registration calls, so something other than
 * the router can walk it. The test that every intent a table declares is one its
 * writer actually handles is the reason: `moveMissionItems` is a command on the
 * `missions` table whose renumbering lives beside the stop writes, and when the
 * two disagreed the surface answered 500 with nothing to say why.
 */
export function tableCommandSpecs(
	db: CommandDb,
	// biome-ignore lint/suspicious/noExplicitAny: each table names its own command
	// union and its own safe row; the list is heterogeneous by construction and
	// only the shared `table`/`run`/`intents` shape is ever read off it.
): readonly AnyTableCommands<any, any>[] {
	return [
		habitatTableCommands(db),
		inspectionTableCommands(db),
		sampleTableCommands(db),
		sampleSpeciesTableCommands(db),
		trapTableCommands(db),
		collectionTableCommands(db),
		collectionSpeciesTableCommands(db),
		applicationMethodTableCommands(db),
		sourceReductionMethodTableCommands(db),
		outreachMethodTableCommands(db),
		biocontrolMethodTableCommands(db),
		vehicleTableCommands(db),
		equipmentTableCommands(db),
		sourceReductionTableCommands(db),
		outreachActionTableCommands(db),
		biocontrolActionTableCommands(db),
		requestedControlActionTableCommands(db),
		applicationTableCommands(db),
		applicationBatchTableCommands(db),
		insecticideTableCommands(db),
		insecticideBatchTableCommands(db),
		formulationTableCommands(db),
		formulationInsecticideTableCommands(db),
		contactTableCommands(db),
		serviceRequestTableCommands(db),
		notificationTypeTableCommands(db),
		notificationRegistrationTableCommands(db),
		notificationRegistrationTypeTableCommands(db),
		missionNotificationTableCommands(db),
		collectionMethodTableCommands(db),
		collectionLureTableCommands(db),
		habitatTypeTableCommands(db),
		regionFolderTableCommands(db),
		regionTableCommands(db),
		organizationSpeciesTableCommands(db),
		addressTableCommands(db),
		// The crew every record type attaches — see `additional-personnel.ts`.
		additionalPersonnelTableCommands(db),
		commentTableCommands(db),
		tagItemTableCommands(db),
		// Standing itineraries, and the day's work drawn off them.
		routeTableCommands(db),
		routeItemTableCommands(db),
		assignmentTableCommands(db),
		assignmentItemTableCommands(db),
		// Planned control work, and the stops it is made of.
		missionTableCommands(db),
		missionItemTableCommands(db),
		// The three global catalogs, behind the operator door.
		genusTableCommands(db),
		speciesTableCommands(db),
		unitTableCommands(db),
	];
}

export function registerTableCommandSurface(
	app: Hono<{ Variables: AuthVariables }>,
	options: {
		readonly db: CommandDb;
		readonly authContextMiddleware: MiddlewareHandler<{ Variables: AuthVariables }>;
		/** Required only by the global catalogs — see `taxonomy.ts`. */
		readonly operatorAuthContextMiddleware: MiddlewareHandler<{ Variables: AuthVariables }>;
	},
): void {
	for (const spec of tableCommandSpecs(options.db)) {
		registerTableCommandRoutes(app, options, spec);
	}
}
