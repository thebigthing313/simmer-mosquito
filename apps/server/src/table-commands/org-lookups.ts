/**
 * The three org-scoped lookup catalogs, as commands.
 *
 * `collection_methods`, `collection_lures` and `habitat_types` — three tables an
 * agency owns and every surveillance record points at, fifteen commands between
 * them.
 *
 * ## What the old routes inferred
 *
 * `foundation-commands/org-lookups.ts` is nine routes built from a three-entry
 * table, and three `build*UpdateCommands` functions underneath it that decide
 * what a PATCH meant by looking at what arrived: a `name` or a `description`
 * means an update, an `isActive` means deactivate *or* reactivate depending on
 * which way the boolean points, and neither means a 400. That is the shape this
 * surface exists to remove — `is_active` is a column a client can see change,
 * but which way it moved is the command's to say, so `deactivate` and
 * `reactivate` are named here and the column is never read.
 *
 * The old PATCH also passed `acknowledgedHistoricalLabelChange: true`
 * unconditionally, hard-coded at all three call sites. Here it goes through
 * `acknowledged()` like every other acknowledgement, so a client that has not
 * confirmed a rename can say so.
 *
 * ## One factory, three catalogs — and what actually differs
 *
 * All three carry `name` and `description`; `custom_schema` is on collection
 * methods and habitat types, `action_threshold` on collection methods alone.
 * That is the whole difference, and `columns` states it per catalog rather than
 * letting three copies of the same reader drift.
 *
 * It is stated rather than inferred for a reason worth recording: the domain
 * builders take their input by spread, so an argument a builder does not declare
 * is dropped without a type error. A catalog that claimed a column it has no
 * column for would read the field, hand it over, and lose it silently — which is
 * why `org-lookups.test.ts` checks each catalog ignores what is not its own.
 *
 * ## Field names
 *
 * Postgres column names: `name`, `description`, `custom_schema`,
 * `action_threshold`. No geometry and no lifecycle instruction, so no camelCase
 * exception here.
 */

import type { OrgLookupRow } from '@simmer-mosquito/db';
import {
	createCollectionLureCommand,
	createCollectionMethodCommand,
	createHabitatTypeCommand,
	deactivateCollectionLureCommand,
	deactivateCollectionMethodCommand,
	deactivateHabitatTypeCommand,
	deleteCollectionLureCommand,
	deleteCollectionMethodCommand,
	deleteHabitatTypeCommand,
	reactivateCollectionLureCommand,
	reactivateCollectionMethodCommand,
	reactivateHabitatTypeCommand,
	updateCollectionLureCommand,
	updateCollectionMethodCommand,
	updateHabitatTypeCommand,
} from '@simmer-mosquito/domain';
import { readNullableText, readText } from '../command-payload.js';
import type { AgencyCommandType } from '../command-permissions.js';
import { type CommandDb, readNumberOrNull } from '../command-write.js';
import type { LookupCommand } from '../foundation-commands/shared.js';
import { writeFoundationLookupCommand } from '../foundation-commands/tags.js';
import type { IntentBuilder, IntentMap, TableCommands } from './dispatch.js';
import { acknowledged } from './shared.js';

/** What every builder in a catalog needs, with the id under a neutral name. */
interface LookupTarget {
	readonly organizationId: string;
	readonly actorProfileId: string;
	readonly id: string;
}

interface LookupCreate extends LookupTarget {
	readonly name: string;
	readonly description: string | null;
	readonly customSchema?: unknown | null;
	readonly actionThreshold?: number | null;
}

interface LookupUpdate extends LookupTarget {
	readonly name?: string;
	readonly description?: string | null;
	readonly customSchema?: unknown | null;
	readonly actionThreshold?: number | null;
	readonly acknowledgedHistoricalLabelChange: boolean;
}

/**
 * One catalog's five domain builders, each already holding its own id argument's
 * name — `collectionMethodId`, `habitatTypeId`, and so on.
 */
interface LookupBuilders {
	readonly create: (input: LookupCreate) => LookupCommand;
	readonly update: (input: LookupUpdate) => LookupCommand;
	readonly deactivate: (input: LookupTarget) => LookupCommand;
	readonly reactivate: (input: LookupTarget) => LookupCommand;
	readonly remove: (input: LookupTarget) => LookupCommand;
}

interface LookupIntents {
	readonly create: AgencyCommandType;
	readonly update: AgencyCommandType;
	readonly deactivate: AgencyCommandType;
	readonly reactivate: AgencyCommandType;
	readonly remove: AgencyCommandType;
}

/** The two columns that are not on all three. `name` and `description` are. */
interface LookupColumns {
	readonly customSchema: boolean;
	readonly actionThreshold: boolean;
}

interface OrgLookupCatalog {
	readonly table: string;
	/** The 404 body's `error`, e.g. `collection_method_not_found`. */
	readonly notFound: string;
	/** The response key the row comes back under, e.g. `collectionMethod`. */
	readonly key: string;
	readonly columns: LookupColumns;
	readonly names: LookupIntents;
	readonly build: LookupBuilders;
}

function orgLookupTableCommands(
	db: CommandDb,
	catalog: OrgLookupCatalog,
): TableCommands<LookupCommand, OrgLookupRow> {
	const target = ({ payload: _payload, agency, id }: Parameters<IntentBuilder<never>>[0]) => ({
		...agency,
		id,
	});

	const intents: Record<string, IntentBuilder<LookupCommand>> = {
		[catalog.names.create]: (request) =>
			catalog.build.create({
				...target(request),
				name: readText(request.payload.name) ?? '',
				description: readNullableText(request.payload.description),
				...(catalog.columns.customSchema
					? { customSchema: request.payload.custom_schema ?? null }
					: {}),
				...(catalog.columns.actionThreshold
					? { actionThreshold: readNumberOrNull(request.payload.action_threshold) }
					: {}),
			}),

		// An absent key means "not changing it" and a present one means the new
		// value, including `null` to clear it — which is why this reads presence
		// rather than truthiness.
		[catalog.names.update]: (request) =>
			catalog.build.update({
				...target(request),
				...('name' in request.payload ? { name: readText(request.payload.name) ?? '' } : {}),
				...('description' in request.payload
					? { description: readNullableText(request.payload.description) }
					: {}),
				...(catalog.columns.customSchema && 'custom_schema' in request.payload
					? { customSchema: request.payload.custom_schema ?? null }
					: {}),
				...(catalog.columns.actionThreshold && 'action_threshold' in request.payload
					? { actionThreshold: readNumberOrNull(request.payload.action_threshold) }
					: {}),
				acknowledgedHistoricalLabelChange: acknowledged(
					request.payload.acknowledgedHistoricalLabelChange,
				),
			}),

		[catalog.names.deactivate]: (request) => catalog.build.deactivate(target(request)),
		[catalog.names.reactivate]: (request) => catalog.build.reactivate(target(request)),
		[catalog.names.remove]: (request) => catalog.build.remove(target(request)),
	};

	return {
		table: catalog.table,
		run: {
			db,
			write: writeFoundationLookupCommand,
			notFound: catalog.notFound,
			key: catalog.key,
		},
		// The keys are `AgencyCommandType` values held in `names`, so a typo is
		// still a build error at the three call sites below; what the cast restores
		// is only what computed keys erase.
		intents: intents as IntentMap<LookupCommand>,
	};
}

export function collectionMethodTableCommands(db: CommandDb) {
	return orgLookupTableCommands(db, {
		table: 'collection_methods',
		notFound: 'collection_method_not_found',
		key: 'collectionMethod',
		columns: { customSchema: true, actionThreshold: true },
		names: {
			create: 'foundation.createCollectionMethod',
			update: 'foundation.updateCollectionMethod',
			deactivate: 'foundation.deactivateCollectionMethod',
			reactivate: 'foundation.reactivateCollectionMethod',
			remove: 'foundation.deleteCollectionMethod',
		},
		build: {
			create: ({ id, ...rest }) =>
				createCollectionMethodCommand({ ...rest, collectionMethodId: id }),
			update: ({ id, ...rest }) =>
				updateCollectionMethodCommand({ ...rest, collectionMethodId: id }),
			deactivate: ({ id, ...rest }) =>
				deactivateCollectionMethodCommand({ ...rest, collectionMethodId: id }),
			reactivate: ({ id, ...rest }) =>
				reactivateCollectionMethodCommand({ ...rest, collectionMethodId: id }),
			remove: ({ id, ...rest }) =>
				deleteCollectionMethodCommand({ ...rest, collectionMethodId: id }),
		},
	});
}

export function collectionLureTableCommands(db: CommandDb) {
	return orgLookupTableCommands(db, {
		table: 'collection_lures',
		notFound: 'collection_lure_not_found',
		key: 'collectionLure',
		// A lure is a name and a description. It has neither a custom schema nor an
		// action threshold, so those keys are not read off its payload at all.
		columns: { customSchema: false, actionThreshold: false },
		names: {
			create: 'foundation.createCollectionLure',
			update: 'foundation.updateCollectionLure',
			deactivate: 'foundation.deactivateCollectionLure',
			reactivate: 'foundation.reactivateCollectionLure',
			remove: 'foundation.deleteCollectionLure',
		},
		build: {
			create: ({ id, ...rest }) => createCollectionLureCommand({ ...rest, collectionLureId: id }),
			update: ({ id, ...rest }) => updateCollectionLureCommand({ ...rest, collectionLureId: id }),
			deactivate: ({ id, ...rest }) =>
				deactivateCollectionLureCommand({ ...rest, collectionLureId: id }),
			reactivate: ({ id, ...rest }) =>
				reactivateCollectionLureCommand({ ...rest, collectionLureId: id }),
			remove: ({ id, ...rest }) => deleteCollectionLureCommand({ ...rest, collectionLureId: id }),
		},
	});
}

export function habitatTypeTableCommands(db: CommandDb) {
	return orgLookupTableCommands(db, {
		table: 'habitat_types',
		notFound: 'habitat_type_not_found',
		key: 'habitatType',
		// `custom_schema` but no `action_threshold`, which is the shape of
		// `HabitatTypesTable` in `packages/db/src/tables.ts` — only
		// `collection_methods` extends the shared lookup base with both.
		columns: { customSchema: true, actionThreshold: false },
		names: {
			create: 'foundation.createHabitatType',
			update: 'foundation.updateHabitatType',
			deactivate: 'foundation.deactivateHabitatType',
			reactivate: 'foundation.reactivateHabitatType',
			remove: 'foundation.deleteHabitatType',
		},
		build: {
			create: ({ id, ...rest }) => createHabitatTypeCommand({ ...rest, habitatTypeId: id }),
			update: ({ id, ...rest }) => updateHabitatTypeCommand({ ...rest, habitatTypeId: id }),
			deactivate: ({ id, ...rest }) => deactivateHabitatTypeCommand({ ...rest, habitatTypeId: id }),
			reactivate: ({ id, ...rest }) => reactivateHabitatTypeCommand({ ...rest, habitatTypeId: id }),
			remove: ({ id, ...rest }) => deleteHabitatTypeCommand({ ...rest, habitatTypeId: id }),
		},
	});
}
