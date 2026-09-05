import {
	assertRecordDeletable,
	type DeletableRecordType,
	type SelectedRow,
	sql,
} from '@simmer-mosquito/db';
import {
	type CreateApplicationMethodCommand,
	type CreateBiocontrolMethodCommand,
	type CreateOutreachMethodCommand,
	type CreateSourceReductionMethodCommand,
	createApplicationMethodCommand,
	createBiocontrolMethodCommand,
	createOutreachMethodCommand,
	createSourceReductionMethodCommand,
	type DeactivateApplicationMethodCommand,
	type DeactivateBiocontrolMethodCommand,
	type DeactivateOutreachMethodCommand,
	type DeactivateSourceReductionMethodCommand,
	type DeleteApplicationMethodCommand,
	type DeleteBiocontrolMethodCommand,
	type DeleteOutreachMethodCommand,
	type DeleteSourceReductionMethodCommand,
	DomainValidationError,
	deactivateApplicationMethodCommand,
	deactivateBiocontrolMethodCommand,
	deactivateOutreachMethodCommand,
	deactivateSourceReductionMethodCommand,
	deleteApplicationMethodCommand,
	deleteBiocontrolMethodCommand,
	deleteOutreachMethodCommand,
	deleteSourceReductionMethodCommand,
	type ReactivateApplicationMethodCommand,
	type ReactivateBiocontrolMethodCommand,
	type ReactivateOutreachMethodCommand,
	type ReactivateSourceReductionMethodCommand,
	reactivateApplicationMethodCommand,
	reactivateBiocontrolMethodCommand,
	reactivateOutreachMethodCommand,
	reactivateSourceReductionMethodCommand,
	type UpdateApplicationMethodCommand,
	type UpdateBiocontrolMethodCommand,
	type UpdateOutreachMethodCommand,
	type UpdateSourceReductionMethodCommand,
	updateApplicationMethodCommand,
	updateBiocontrolMethodCommand,
	updateOutreachMethodCommand,
	updateSourceReductionMethodCommand,
} from '@simmer-mosquito/domain';
import type { Hono, MiddlewareHandler } from 'hono';
import type { AuthContext } from './auth-context.js';
import type { AuthVariables } from './auth-middleware.js';
import {
	type CommandContext,
	type CommandsResult,
	commandEndpoint,
	createCommand,
	invalidUpdate,
	organizationCommandContext,
	type PayloadResult,
} from './command-endpoint.js';
import { acknowledged } from './command-payload.js';
import { type CommandDb, type CommandTransaction, runCommands } from './command-write.js';
import { assertCitedHistoryAcknowledged } from './record-history.js';

type ControlMethodCommandDb = CommandDb;
type ControlMethodTransaction = CommandTransaction;

type ApplicationMethodCommand =
	| CreateApplicationMethodCommand
	| UpdateApplicationMethodCommand
	| DeactivateApplicationMethodCommand
	| ReactivateApplicationMethodCommand
	| DeleteApplicationMethodCommand;
type SourceReductionMethodCommand =
	| CreateSourceReductionMethodCommand
	| UpdateSourceReductionMethodCommand
	| DeactivateSourceReductionMethodCommand
	| ReactivateSourceReductionMethodCommand
	| DeleteSourceReductionMethodCommand;
type OutreachMethodCommand =
	| CreateOutreachMethodCommand
	| UpdateOutreachMethodCommand
	| DeactivateOutreachMethodCommand
	| ReactivateOutreachMethodCommand
	| DeleteOutreachMethodCommand;
type BiocontrolMethodCommand =
	| CreateBiocontrolMethodCommand
	| UpdateBiocontrolMethodCommand
	| DeactivateBiocontrolMethodCommand
	| ReactivateBiocontrolMethodCommand
	| DeleteBiocontrolMethodCommand;
export type ControlMethodCommand =
	| ApplicationMethodCommand
	| SourceReductionMethodCommand
	| OutreachMethodCommand
	| BiocontrolMethodCommand;

type ControlMethodKind =
	| 'application-methods'
	| 'source-reduction-methods'
	| 'outreach-methods'
	| 'biocontrol-methods';

export function registerControlMethodCommandRoutes(
	app: Hono<{ Variables: AuthVariables }>,
	options: {
		readonly db: ControlMethodCommandDb;
		readonly authContextMiddleware: MiddlewareHandler<{ Variables: AuthVariables }>;
	},
): void {
	// The kind is checked before the body is read, so an unknown catalog answers
	// 404 whatever the payload looks like.
	const requireKind: MiddlewareHandler<{ Variables: AuthVariables }> = async (context, next) => {
		if (!readKind(context.req.param('kind') ?? '').ok) {
			return context.json({ error: 'method_kind_not_found' }, 404);
		}
		await next();
	};

	const run = (
		context: CommandContext,
		commands: readonly ControlMethodCommand[],
		createdStatus?: 201,
	) =>
		runCommands(
			context,
			{
				db: options.db,
				write: async (trx, command) => await writeControlMethodCommand(trx, command),
				notFound: 'control_method_not_found',
				key: 'method',
			},
			commands,
			createdStatus,
		);

	app.post(
		'/control-methods/:kind',
		options.authContextMiddleware,
		requireKind,
		commandEndpoint({
			readPayload: readCreatePayload,
			build: ({ payload, authContext, param }) =>
				buildCreateCommand(requiredKind(param('kind')), authContext, payload),
			run: (context, commands) => run(context, commands, 201),
		}),
	);

	app.patch(
		'/control-methods/:kind/:methodId',
		options.authContextMiddleware,
		requireKind,
		commandEndpoint({
			readPayload: readUpdatePayload,
			build: ({ payload, authContext, param }) =>
				buildUpdateCommands(requiredKind(param('kind')), authContext, param('methodId'), payload),
			run,
		}),
	);

	app.delete(
		'/control-methods/:kind/:methodId',
		options.authContextMiddleware,
		requireKind,
		commandEndpoint({
			body: 'none',
			build: ({ authContext, param }) =>
				buildDeleteCommand(requiredKind(param('kind')), authContext, param('methodId')),
			run,
		}),
	);
}

/** Past `requireKind`, the path segment is one of the four. */
function requiredKind(value: string): ControlMethodKind {
	const kind = readKind(value);
	if (!kind.ok) {
		throw new Error(`Unhandled control method kind ${value}.`);
	}
	return kind.kind;
}

/**
 * The four method catalogs share one rename question, so they share one call.
 *
 * Nothing snapshots a method's name onto the actions performed with it, so a
 * rename relabels every one of them. The custom schema is not what a past
 * action is read back under, so editing it alone asks nothing.
 */
async function assertMethodRename(
	db: ControlMethodTransaction,
	recordType: DeletableRecordType,
	subject: string,
	recordId: string,
	payload: {
		readonly organizationId: string;
		readonly changes: { readonly name?: string };
		readonly acknowledgedHistoricalLabelChange: boolean;
	},
): Promise<void> {
	await assertCitedHistoryAcknowledged(db, {
		recordType,
		subject,
		recordId,
		organizationId: payload.organizationId,
		acknowledgement: 'acknowledgedHistoricalLabelChange',
		acknowledged: payload.acknowledgedHistoricalLabelChange,
		relabels: payload.changes.name !== undefined,
	});
}

export async function writeControlMethodCommand(
	db: ControlMethodTransaction,
	command: ControlMethodCommand,
): Promise<ControlMethodRow | null> {
	switch (command.type) {
		case 'controlOperations.createApplicationMethod':
			return createControlMethod(db, 'application_methods', {
				id: command.payload.applicationMethodId,
				organizationId: command.payload.organizationId,
				name: command.payload.name,
				customSchema: command.payload.customSchema,
				isActive: true,
				actorProfileId: command.payload.actorProfileId,
			});
		case 'controlOperations.updateApplicationMethod':
			await assertMethodRename(
				db,
				'applicationMethod',
				'application method',
				command.payload.applicationMethodId,
				command.payload,
			);
			return updateControlMethod(db, 'application_methods', command.payload.applicationMethodId, {
				organizationId: command.payload.organizationId,
				...command.payload.changes,
				actorProfileId: command.payload.actorProfileId,
			});
		case 'controlOperations.deactivateApplicationMethod':
			return setControlMethodActive(
				db,
				'application_methods',
				command.payload.applicationMethodId,
				{
					organizationId: command.payload.organizationId,
					actorProfileId: command.payload.actorProfileId,
					isActive: false,
				},
			);
		case 'controlOperations.reactivateApplicationMethod':
			return setControlMethodActive(
				db,
				'application_methods',
				command.payload.applicationMethodId,
				{
					organizationId: command.payload.organizationId,
					actorProfileId: command.payload.actorProfileId,
					isActive: true,
				},
			);
		case 'controlOperations.deleteApplicationMethod':
			return deleteControlMethod(db, 'application_methods', command.payload.applicationMethodId, {
				organizationId: command.payload.organizationId,
				actorProfileId: command.payload.actorProfileId,
			});
		case 'controlOperations.createSourceReductionMethod':
			return createControlMethod(db, 'source_reduction_methods', {
				id: command.payload.sourceReductionMethodId,
				organizationId: command.payload.organizationId,
				name: command.payload.name,
				customSchema: command.payload.customSchema,
				isActive: true,
				actorProfileId: command.payload.actorProfileId,
			});
		case 'controlOperations.updateSourceReductionMethod':
			await assertMethodRename(
				db,
				'sourceReductionMethod',
				'source reduction method',
				command.payload.sourceReductionMethodId,
				command.payload,
			);
			return updateControlMethod(
				db,
				'source_reduction_methods',
				command.payload.sourceReductionMethodId,
				{
					organizationId: command.payload.organizationId,
					...command.payload.changes,
					actorProfileId: command.payload.actorProfileId,
				},
			);
		case 'controlOperations.deactivateSourceReductionMethod':
			return setControlMethodActive(
				db,
				'source_reduction_methods',
				command.payload.sourceReductionMethodId,
				{
					organizationId: command.payload.organizationId,
					actorProfileId: command.payload.actorProfileId,
					isActive: false,
				},
			);
		case 'controlOperations.reactivateSourceReductionMethod':
			return setControlMethodActive(
				db,
				'source_reduction_methods',
				command.payload.sourceReductionMethodId,
				{
					organizationId: command.payload.organizationId,
					actorProfileId: command.payload.actorProfileId,
					isActive: true,
				},
			);
		case 'controlOperations.deleteSourceReductionMethod':
			return deleteControlMethod(
				db,
				'source_reduction_methods',
				command.payload.sourceReductionMethodId,
				{
					organizationId: command.payload.organizationId,
					actorProfileId: command.payload.actorProfileId,
				},
			);
		case 'controlOperations.createOutreachMethod':
			return createControlMethod(db, 'outreach_methods', {
				id: command.payload.outreachMethodId,
				organizationId: command.payload.organizationId,
				name: command.payload.name,
				customSchema: command.payload.customSchema,
				isActive: true,
				actorProfileId: command.payload.actorProfileId,
			});
		case 'controlOperations.updateOutreachMethod':
			await assertMethodRename(
				db,
				'outreachMethod',
				'outreach method',
				command.payload.outreachMethodId,
				command.payload,
			);
			return updateControlMethod(db, 'outreach_methods', command.payload.outreachMethodId, {
				organizationId: command.payload.organizationId,
				...command.payload.changes,
				actorProfileId: command.payload.actorProfileId,
			});
		case 'controlOperations.deactivateOutreachMethod':
			return setControlMethodActive(db, 'outreach_methods', command.payload.outreachMethodId, {
				organizationId: command.payload.organizationId,
				actorProfileId: command.payload.actorProfileId,
				isActive: false,
			});
		case 'controlOperations.reactivateOutreachMethod':
			return setControlMethodActive(db, 'outreach_methods', command.payload.outreachMethodId, {
				organizationId: command.payload.organizationId,
				actorProfileId: command.payload.actorProfileId,
				isActive: true,
			});
		case 'controlOperations.deleteOutreachMethod':
			return deleteControlMethod(db, 'outreach_methods', command.payload.outreachMethodId, {
				organizationId: command.payload.organizationId,
				actorProfileId: command.payload.actorProfileId,
			});
		case 'controlOperations.createBiocontrolMethod':
			return createControlMethod(db, 'biocontrol_methods', {
				id: command.payload.biocontrolMethodId,
				organizationId: command.payload.organizationId,
				name: command.payload.name,
				customSchema: command.payload.customSchema,
				isActive: true,
				actorProfileId: command.payload.actorProfileId,
			});
		case 'controlOperations.updateBiocontrolMethod':
			await assertMethodRename(
				db,
				'biocontrolMethod',
				'biocontrol method',
				command.payload.biocontrolMethodId,
				command.payload,
			);
			return updateControlMethod(db, 'biocontrol_methods', command.payload.biocontrolMethodId, {
				organizationId: command.payload.organizationId,
				...command.payload.changes,
				actorProfileId: command.payload.actorProfileId,
			});
		case 'controlOperations.deactivateBiocontrolMethod':
			return setControlMethodActive(db, 'biocontrol_methods', command.payload.biocontrolMethodId, {
				organizationId: command.payload.organizationId,
				actorProfileId: command.payload.actorProfileId,
				isActive: false,
			});
		case 'controlOperations.reactivateBiocontrolMethod':
			return setControlMethodActive(db, 'biocontrol_methods', command.payload.biocontrolMethodId, {
				organizationId: command.payload.organizationId,
				actorProfileId: command.payload.actorProfileId,
				isActive: true,
			});
		case 'controlOperations.deleteBiocontrolMethod':
			return deleteControlMethod(db, 'biocontrol_methods', command.payload.biocontrolMethodId, {
				organizationId: command.payload.organizationId,
				actorProfileId: command.payload.actorProfileId,
			});
	}
}

/**
 * What a control method answers with.
 *
 * The four method tables carry the same columns, so one list and one row type
 * serve all of them.
 */
const controlMethodReturnColumns = [
	'id',
	'organization_id',
	'name',
	'custom_schema',
	'is_active',
	'created_at',
	'updated_at',
] as const;

type ControlMethodRow = SelectedRow<'application_methods', typeof controlMethodReturnColumns>;

type ControlMethodTableName =
	| 'application_methods'
	| 'source_reduction_methods'
	| 'outreach_methods'
	| 'biocontrol_methods';

interface ControlMethodWriteInput {
	readonly id: string;
	readonly organizationId: string;
	readonly name: string;
	readonly customSchema: unknown | null;
	readonly isActive: boolean;
	readonly actorProfileId: string;
}

interface ControlMethodUpdateInput {
	readonly organizationId: string;
	readonly name?: string;
	readonly customSchema?: unknown | null;
	readonly actorProfileId: string;
}

interface ControlMethodLifecycleInput {
	readonly organizationId: string;
	readonly actorProfileId: string;
}

async function createControlMethod(
	db: ControlMethodTransaction,
	table: ControlMethodTableName,
	input: ControlMethodWriteInput,
): Promise<ControlMethodRow> {
	const row = await db
		.insertInto(table)
		.values({
			id: input.id,
			organization_id: input.organizationId,
			name: input.name,
			custom_schema: input.customSchema,
			is_active: input.isActive,
			created_by_profile_id: input.actorProfileId,
			updated_by_profile_id: input.actorProfileId,
		})
		.returning(controlMethodReturnColumns)
		.executeTakeFirstOrThrow();

	return row;
}

async function updateControlMethod(
	db: ControlMethodTransaction,
	table: ControlMethodTableName,
	methodId: string,
	input: ControlMethodUpdateInput,
): Promise<ControlMethodRow | null> {
	const row = await db
		.updateTable(table)
		.set({
			...(input.name === undefined ? {} : { name: input.name }),
			...(input.customSchema === undefined ? {} : { custom_schema: input.customSchema }),
			updated_by_profile_id: input.actorProfileId,
			updated_at: sql`now()`,
		})
		.where('id', '=', methodId)
		.where('organization_id', '=', input.organizationId)
		.where('deleted_at', 'is', null)
		.returning(controlMethodReturnColumns)
		.executeTakeFirst();

	return row ?? null;
}

async function setControlMethodActive(
	db: ControlMethodTransaction,
	table: ControlMethodTableName,
	methodId: string,
	input: ControlMethodLifecycleInput & { readonly isActive: boolean },
): Promise<ControlMethodRow | null> {
	const row = await db
		.updateTable(table)
		.set({
			is_active: input.isActive,
			updated_by_profile_id: input.actorProfileId,
			updated_at: sql`now()`,
		})
		.where('id', '=', methodId)
		.where('organization_id', '=', input.organizationId)
		.where('deleted_at', 'is', null)
		.returning(controlMethodReturnColumns)
		.executeTakeFirst();

	return row ?? null;
}

/**
 * The four method catalogs are one writer, so the delete guard needs the
 * record type its table answers to. A `Record` over the table union rather
 * than a lookup that can miss: a fifth method catalog will not compile until
 * it names its type here.
 */
const CONTROL_METHOD_RECORD_TYPES: Record<ControlMethodTableName, DeletableRecordType> = {
	application_methods: 'applicationMethod',
	source_reduction_methods: 'sourceReductionMethod',
	outreach_methods: 'outreachMethod',
	biocontrol_methods: 'biocontrolMethod',
};

async function deleteControlMethod(
	db: ControlMethodTransaction,
	table: ControlMethodTableName,
	methodId: string,
	input: ControlMethodLifecycleInput,
): Promise<ControlMethodRow | null> {
	await assertRecordDeletable(db, {
		recordType: CONTROL_METHOD_RECORD_TYPES[table],
		recordId: methodId,
		organizationId: input.organizationId,
	});

	const row = await db
		.updateTable(table)
		.set({
			deleted_at: sql`now()`,
			deleted_by_profile_id: input.actorProfileId,
			updated_by_profile_id: input.actorProfileId,
			updated_at: sql`now()`,
		})
		.where('id', '=', methodId)
		.where('organization_id', '=', input.organizationId)
		.where('deleted_at', 'is', null)
		.returning(controlMethodReturnColumns)
		.executeTakeFirst();

	return row ?? null;
}

function buildCreateCommand(
	kind: ControlMethodKind,
	authContext: AuthContext,
	payload: ControlMethodCreatePayload,
): ControlMethodCommand {
	const context = organizationCommandContext(authContext);
	switch (kind) {
		case 'application-methods':
			return createApplicationMethodCommand({
				...context,
				applicationMethodId: payload.id,
				name: payload.name,
				customSchema: payload.customSchema,
			});
		case 'source-reduction-methods':
			return createSourceReductionMethodCommand({
				...context,
				sourceReductionMethodId: payload.id,
				name: payload.name,
				customSchema: payload.customSchema,
			});
		case 'outreach-methods':
			return createOutreachMethodCommand({
				...context,
				outreachMethodId: payload.id,
				name: payload.name,
				customSchema: payload.customSchema,
			});
		case 'biocontrol-methods':
			return createBiocontrolMethodCommand({
				...context,
				biocontrolMethodId: payload.id,
				name: payload.name,
				customSchema: payload.customSchema,
			});
	}
}

function buildUpdateCommands(
	kind: ControlMethodKind,
	authContext: AuthContext,
	methodId: string,
	payload: ControlMethodUpdatePayload,
): CommandsResult<ControlMethodCommand> {
	const commands: ControlMethodCommand[] = [];
	const hasDetailChange = payload.name !== undefined || payload.customSchema !== undefined;
	const context = organizationCommandContext(authContext);

	if (hasDetailChange) {
		const commandResult = createCommand(() =>
			buildDetailUpdateCommand(kind, context, methodId, payload),
		);
		if (!commandResult.ok) {
			return commandResult;
		}
		commands.push(commandResult.command);
	}

	if (payload.isActive !== undefined) {
		const commandResult = createCommand(() =>
			buildActiveCommand(kind, context, methodId, payload.isActive === true),
		);
		if (!commandResult.ok) {
			return commandResult;
		}
		commands.push(commandResult.command);
	}

	if (commands.length === 0) {
		return invalidUpdate('control method');
	}

	return { ok: true, commands };
}

function buildDetailUpdateCommand(
	kind: ControlMethodKind,
	context: ReturnType<typeof organizationCommandContext>,
	methodId: string,
	payload: ControlMethodUpdatePayload,
): ControlMethodCommand {
	const changes = {
		...context,
		...(payload.name === undefined ? {} : { name: payload.name }),
		...(payload.customSchema === undefined ? {} : { customSchema: payload.customSchema }),
		acknowledgedHistoricalLabelChange: payload.acknowledgedHistoricalLabelChange,
	};
	switch (kind) {
		case 'application-methods':
			return updateApplicationMethodCommand({ ...changes, applicationMethodId: methodId });
		case 'source-reduction-methods':
			return updateSourceReductionMethodCommand({ ...changes, sourceReductionMethodId: methodId });
		case 'outreach-methods':
			return updateOutreachMethodCommand({ ...changes, outreachMethodId: methodId });
		case 'biocontrol-methods':
			return updateBiocontrolMethodCommand({ ...changes, biocontrolMethodId: methodId });
	}
}

function buildActiveCommand(
	kind: ControlMethodKind,
	context: ReturnType<typeof organizationCommandContext>,
	methodId: string,
	isActive: boolean,
): ControlMethodCommand {
	switch (kind) {
		case 'application-methods':
			return isActive
				? reactivateApplicationMethodCommand({ ...context, applicationMethodId: methodId })
				: deactivateApplicationMethodCommand({ ...context, applicationMethodId: methodId });
		case 'source-reduction-methods':
			return isActive
				? reactivateSourceReductionMethodCommand({ ...context, sourceReductionMethodId: methodId })
				: deactivateSourceReductionMethodCommand({ ...context, sourceReductionMethodId: methodId });
		case 'outreach-methods':
			return isActive
				? reactivateOutreachMethodCommand({ ...context, outreachMethodId: methodId })
				: deactivateOutreachMethodCommand({ ...context, outreachMethodId: methodId });
		case 'biocontrol-methods':
			return isActive
				? reactivateBiocontrolMethodCommand({ ...context, biocontrolMethodId: methodId })
				: deactivateBiocontrolMethodCommand({ ...context, biocontrolMethodId: methodId });
	}
}

function buildDeleteCommand(
	kind: ControlMethodKind,
	authContext: AuthContext,
	methodId: string,
): ControlMethodCommand {
	const context = organizationCommandContext(authContext);
	switch (kind) {
		case 'application-methods':
			return deleteApplicationMethodCommand({ ...context, applicationMethodId: methodId });
		case 'source-reduction-methods':
			return deleteSourceReductionMethodCommand({ ...context, sourceReductionMethodId: methodId });
		case 'outreach-methods':
			return deleteOutreachMethodCommand({ ...context, outreachMethodId: methodId });
		case 'biocontrol-methods':
			return deleteBiocontrolMethodCommand({ ...context, biocontrolMethodId: methodId });
	}
}

interface ControlMethodCreatePayload {
	readonly id: string;
	readonly name: string;
	readonly customSchema: unknown | null;
}

interface ControlMethodUpdatePayload {
	readonly name?: string;
	readonly customSchema?: unknown | null;
	readonly isActive?: boolean;
	readonly acknowledgedHistoricalLabelChange: boolean;
}

function readCreatePayload(
	raw: Record<string, unknown>,
): PayloadResult<ControlMethodCreatePayload> {
	const id = readRequiredText(raw.id);
	const name = readRequiredText(raw.name);
	if (id === null || name === null) {
		return invalidPayload('id and name are required.');
	}

	return {
		ok: true,
		payload: {
			id,
			name,
			customSchema: readOptionalJson(raw.customSchema),
		},
	};
}

function readUpdatePayload(
	raw: Record<string, unknown>,
): PayloadResult<ControlMethodUpdatePayload> {
	if (raw.isActive !== undefined && typeof raw.isActive !== 'boolean') {
		return invalidPayload('isActive must be a boolean.');
	}

	return {
		ok: true,
		payload: {
			...(raw.name === undefined ? {} : { name: readRequiredText(raw.name) ?? '' }),
			...(raw.customSchema === undefined
				? {}
				: { customSchema: readOptionalJson(raw.customSchema) }),
			...(raw.isActive === undefined ? {} : { isActive: raw.isActive }),
			acknowledgedHistoricalLabelChange: acknowledged(raw, 'acknowledgedHistoricalLabelChange'),
		},
	};
}

function readKind(
	value: string,
): { readonly ok: true; readonly kind: ControlMethodKind } | { readonly ok: false } {
	return value === 'application-methods' ||
		value === 'source-reduction-methods' ||
		value === 'outreach-methods' ||
		value === 'biocontrol-methods'
		? { ok: true, kind: value }
		: { ok: false };
}

function readRequiredText(value: unknown): string | null {
	if (typeof value !== 'string') {
		return null;
	}

	const trimmed = value.trim();
	return trimmed.length === 0 ? null : trimmed;
}

function readOptionalJson(value: unknown): unknown | null {
	return value === undefined ? null : value;
}

function invalidPayload(reason: string): PayloadResult<never> {
	return { ok: false, reason };
}
