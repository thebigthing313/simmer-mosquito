/**
 * The four control-method catalogs, as commands.
 *
 * `application_methods`, `source_reduction_methods`, `outreach_methods` and
 * `biocontrol_methods` — four tables with the same three columns, twenty
 * commands between them.
 *
 * ## The `:kind` parameter disappears
 *
 * The old surface was one endpoint for all four: `POST /control-methods/:kind`,
 * with a `requireKind` middleware answering 404 for a path segment that was not
 * one of the four spellings, and three `switch (kind)` builders underneath. That
 * indirection existed only because the route could not say which catalog it was
 * about. Here the table *is* the route, so the kind is not a parameter, not
 * validated, and not switched on — `/commands/application_methods` is the
 * application methods, and a wrong table name is a wrong URL.
 *
 * The old PATCH also read `isActive` for its direction, like every other
 * lifecycle boolean on this branch. Deactivate and reactivate are named here.
 *
 * ## One reader, four catalogs
 *
 * The maps are built by a factory rather than written out four times. The
 * *rules* are what would otherwise be copied — how `custom_schema` is read, that
 * an absent `name` means "not changing it", which acknowledgement a rename
 * carries — and those are identical across the four because the tables are.
 * Only the domain argument's name differs, so that is all a per-catalog adapter
 * supplies.
 *
 * ## Field names
 *
 * Postgres column names: `name`, `custom_schema`. No geometry and no lifecycle
 * instruction, so no camelCase exception here.
 */

import {
	createApplicationMethodCommand,
	createBiocontrolMethodCommand,
	createOutreachMethodCommand,
	createSourceReductionMethodCommand,
	deactivateApplicationMethodCommand,
	deactivateBiocontrolMethodCommand,
	deactivateOutreachMethodCommand,
	deactivateSourceReductionMethodCommand,
	deleteApplicationMethodCommand,
	deleteBiocontrolMethodCommand,
	deleteOutreachMethodCommand,
	deleteSourceReductionMethodCommand,
	reactivateApplicationMethodCommand,
	reactivateBiocontrolMethodCommand,
	reactivateOutreachMethodCommand,
	reactivateSourceReductionMethodCommand,
	updateApplicationMethodCommand,
	updateBiocontrolMethodCommand,
	updateOutreachMethodCommand,
	updateSourceReductionMethodCommand,
} from '@simmer-mosquito/domain';
import { readText } from '../command-payload.js';
import type { AgencyCommandType } from '../command-permissions.js';
import type { CommandDb } from '../command-write.js';
import {
	type ControlMethodCommand,
	toControlMethodResponse,
	writeControlMethodCommand,
} from '../control-method-commands.js';
import type { IntentBuilder, IntentMap, TableCommands } from './dispatch.js';
import { acknowledged } from './shared.js';

/** What every builder in a catalog needs, with the id under a neutral name. */
interface MethodTarget {
	readonly organizationId: string;
	readonly actorProfileId: string;
	readonly id: string;
}

interface MethodCreate extends MethodTarget {
	readonly name: string;
	readonly customSchema: unknown | null;
}

interface MethodUpdate extends MethodTarget {
	readonly name?: string;
	readonly customSchema?: unknown | null;
	readonly acknowledgedHistoricalLabelChange: boolean;
}

/**
 * One catalog's five domain builders, each already holding its own id argument's
 * name — `applicationMethodId`, `outreachMethodId`, and so on. The only thing
 * that differs between the four.
 */
interface MethodBuilders {
	readonly create: (input: MethodCreate) => ControlMethodCommand;
	readonly update: (input: MethodUpdate) => ControlMethodCommand;
	readonly deactivate: (input: MethodTarget) => ControlMethodCommand;
	readonly reactivate: (input: MethodTarget) => ControlMethodCommand;
	readonly remove: (input: MethodTarget) => ControlMethodCommand;
}

interface MethodIntents {
	readonly create: AgencyCommandType;
	readonly update: AgencyCommandType;
	readonly deactivate: AgencyCommandType;
	readonly reactivate: AgencyCommandType;
	readonly remove: AgencyCommandType;
}

type MethodResponse = ReturnType<typeof toControlMethodResponse>;

function methodTableCommands(
	db: CommandDb,
	table: string,
	names: MethodIntents,
	build: MethodBuilders,
): TableCommands<ControlMethodCommand, NonNullable<MethodResponse>> {
	const target = ({ payload: _payload, agency, id }: Parameters<IntentBuilder<never>>[0]) => ({
		...agency,
		id,
	});

	const intents: Record<string, IntentBuilder<ControlMethodCommand>> = {
		[names.create]: (request) =>
			build.create({
				...target(request),
				name: readText(request.payload.name) ?? '',
				customSchema: request.payload.custom_schema ?? null,
			}),

		// An absent key means "not changing it" and a present one means the new
		// value, including `null` to clear the schema — which is why this reads
		// presence rather than truthiness.
		[names.update]: (request) =>
			build.update({
				...target(request),
				...('name' in request.payload ? { name: readText(request.payload.name) ?? '' } : {}),
				...('custom_schema' in request.payload
					? { customSchema: request.payload.custom_schema ?? null }
					: {}),
				acknowledgedHistoricalLabelChange: acknowledged(
					request.payload.acknowledgedHistoricalLabelChange,
				),
			}),

		[names.deactivate]: (request) => build.deactivate(target(request)),
		[names.reactivate]: (request) => build.reactivate(target(request)),
		[names.remove]: (request) => build.remove(target(request)),
	};

	return {
		table,
		run: {
			db,
			write: async (trx, command) =>
				toControlMethodResponse(await writeControlMethodCommand(trx, command)),
			notFound: 'control_method_not_found',
			key: 'method',
		},
		// The keys are `AgencyCommandType` values held in `names`, so a typo is
		// still a build error at the four call sites below; what the cast restores
		// is only what computed keys erase.
		intents: intents as IntentMap<ControlMethodCommand>,
	};
}

export function applicationMethodTableCommands(db: CommandDb) {
	return methodTableCommands(
		db,
		'application_methods',
		{
			create: 'controlOperations.createApplicationMethod',
			update: 'controlOperations.updateApplicationMethod',
			deactivate: 'controlOperations.deactivateApplicationMethod',
			reactivate: 'controlOperations.reactivateApplicationMethod',
			remove: 'controlOperations.deleteApplicationMethod',
		},
		{
			create: ({ id, ...rest }) =>
				createApplicationMethodCommand({ ...rest, applicationMethodId: id }),
			update: ({ id, ...rest }) =>
				updateApplicationMethodCommand({ ...rest, applicationMethodId: id }),
			deactivate: ({ id, ...rest }) =>
				deactivateApplicationMethodCommand({ ...rest, applicationMethodId: id }),
			reactivate: ({ id, ...rest }) =>
				reactivateApplicationMethodCommand({ ...rest, applicationMethodId: id }),
			remove: ({ id, ...rest }) =>
				deleteApplicationMethodCommand({ ...rest, applicationMethodId: id }),
		},
	);
}

export function sourceReductionMethodTableCommands(db: CommandDb) {
	return methodTableCommands(
		db,
		'source_reduction_methods',
		{
			create: 'controlOperations.createSourceReductionMethod',
			update: 'controlOperations.updateSourceReductionMethod',
			deactivate: 'controlOperations.deactivateSourceReductionMethod',
			reactivate: 'controlOperations.reactivateSourceReductionMethod',
			remove: 'controlOperations.deleteSourceReductionMethod',
		},
		{
			create: ({ id, ...rest }) =>
				createSourceReductionMethodCommand({ ...rest, sourceReductionMethodId: id }),
			update: ({ id, ...rest }) =>
				updateSourceReductionMethodCommand({ ...rest, sourceReductionMethodId: id }),
			deactivate: ({ id, ...rest }) =>
				deactivateSourceReductionMethodCommand({ ...rest, sourceReductionMethodId: id }),
			reactivate: ({ id, ...rest }) =>
				reactivateSourceReductionMethodCommand({ ...rest, sourceReductionMethodId: id }),
			remove: ({ id, ...rest }) =>
				deleteSourceReductionMethodCommand({ ...rest, sourceReductionMethodId: id }),
		},
	);
}

export function outreachMethodTableCommands(db: CommandDb) {
	return methodTableCommands(
		db,
		'outreach_methods',
		{
			create: 'controlOperations.createOutreachMethod',
			update: 'controlOperations.updateOutreachMethod',
			deactivate: 'controlOperations.deactivateOutreachMethod',
			reactivate: 'controlOperations.reactivateOutreachMethod',
			remove: 'controlOperations.deleteOutreachMethod',
		},
		{
			create: ({ id, ...rest }) => createOutreachMethodCommand({ ...rest, outreachMethodId: id }),
			update: ({ id, ...rest }) => updateOutreachMethodCommand({ ...rest, outreachMethodId: id }),
			deactivate: ({ id, ...rest }) =>
				deactivateOutreachMethodCommand({ ...rest, outreachMethodId: id }),
			reactivate: ({ id, ...rest }) =>
				reactivateOutreachMethodCommand({ ...rest, outreachMethodId: id }),
			remove: ({ id, ...rest }) => deleteOutreachMethodCommand({ ...rest, outreachMethodId: id }),
		},
	);
}

export function biocontrolMethodTableCommands(db: CommandDb) {
	return methodTableCommands(
		db,
		'biocontrol_methods',
		{
			create: 'controlOperations.createBiocontrolMethod',
			update: 'controlOperations.updateBiocontrolMethod',
			deactivate: 'controlOperations.deactivateBiocontrolMethod',
			reactivate: 'controlOperations.reactivateBiocontrolMethod',
			remove: 'controlOperations.deleteBiocontrolMethod',
		},
		{
			create: ({ id, ...rest }) =>
				createBiocontrolMethodCommand({ ...rest, biocontrolMethodId: id }),
			update: ({ id, ...rest }) =>
				updateBiocontrolMethodCommand({ ...rest, biocontrolMethodId: id }),
			deactivate: ({ id, ...rest }) =>
				deactivateBiocontrolMethodCommand({ ...rest, biocontrolMethodId: id }),
			reactivate: ({ id, ...rest }) =>
				reactivateBiocontrolMethodCommand({ ...rest, biocontrolMethodId: id }),
			remove: ({ id, ...rest }) =>
				deleteBiocontrolMethodCommand({ ...rest, biocontrolMethodId: id }),
		},
	);
}
