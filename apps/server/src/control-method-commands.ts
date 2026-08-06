import {
	type MutationWriteResult,
	type SafeOrgLookup,
	sql,
	writeCollectionMethodLookupCommandsWithTxid,
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
import { isRecord } from './command-payload.js';
import { denyUnauthorizedAgencyCommands } from './command-permissions.js';

type ControlMethodCommandDb = Parameters<typeof writeCollectionMethodLookupCommandsWithTxid>[0];
type ControlMethodTransaction = Parameters<
	Parameters<typeof writeCollectionMethodLookupCommandsWithTxid>[1]
>[0];

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
type ControlMethodCommand =
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
	app.post('/control-methods/:kind', options.authContextMiddleware, async (context) => {
		const kindResult = readKind(context.req.param('kind'));
		if (!kindResult.ok) {
			return context.json({ error: 'method_kind_not_found' }, 404);
		}

		const payloadResult = await readCreatePayload(context.req);
		if (!payloadResult.ok) {
			return context.json({ error: 'invalid_payload', reason: payloadResult.reason }, 400);
		}

		const commandResult = createCommand(() =>
			buildCreateCommand(kindResult.kind, context.get('authContext'), payloadResult.payload),
		);
		if (!commandResult.ok) {
			return context.json(commandResult.body, 400);
		}

		const denial = denyUnauthorizedAgencyCommands(context, [commandResult.command]);
		if (denial !== null) {
			return denial;
		}

		const result = await writeControlMethodCommands(options.db, [commandResult.command]);
		return context.json({ method: toControlMethodResponse(result.row), txid: result.txid }, 201);
	});

	app.patch('/control-methods/:kind/:methodId', options.authContextMiddleware, async (context) => {
		const kindResult = readKind(context.req.param('kind'));
		if (!kindResult.ok) {
			return context.json({ error: 'method_kind_not_found' }, 404);
		}

		const payloadResult = await readUpdatePayload(context.req);
		if (!payloadResult.ok) {
			return context.json({ error: 'invalid_payload', reason: payloadResult.reason }, 400);
		}

		const commandsResult = buildUpdateCommands(
			kindResult.kind,
			context.get('authContext'),
			context.req.param('methodId'),
			payloadResult.payload,
		);
		if (!commandsResult.ok) {
			return context.json(commandsResult.body, 400);
		}

		const denial = denyUnauthorizedAgencyCommands(context, commandsResult.commands);
		if (denial !== null) {
			return denial;
		}

		const result = await writeControlMethodCommands(options.db, commandsResult.commands);
		if (result.row === null) {
			return context.json({ error: 'control_method_not_found' }, 404);
		}

		return context.json({ method: toControlMethodResponse(result.row), txid: result.txid });
	});

	app.delete('/control-methods/:kind/:methodId', options.authContextMiddleware, async (context) => {
		const kindResult = readKind(context.req.param('kind'));
		if (!kindResult.ok) {
			return context.json({ error: 'method_kind_not_found' }, 404);
		}

		const commandResult = createCommand(() =>
			buildDeleteCommand(
				kindResult.kind,
				context.get('authContext'),
				context.req.param('methodId'),
			),
		);
		if (!commandResult.ok) {
			return context.json(commandResult.body, 400);
		}

		const denial = denyUnauthorizedAgencyCommands(context, [commandResult.command]);
		if (denial !== null) {
			return denial;
		}

		const result = await writeControlMethodCommands(options.db, [commandResult.command]);
		if (result.row === null) {
			return context.json({ error: 'control_method_not_found' }, 404);
		}

		return context.json({ method: toControlMethodResponse(result.row), txid: result.txid });
	});
}

async function writeControlMethodCommands(
	db: ControlMethodCommandDb,
	commands: readonly ControlMethodCommand[],
): Promise<MutationWriteResult<SafeOrgLookup | null>> {
	return writeCollectionMethodLookupCommandsWithTxid(db, async (trx) => {
		let row: SafeOrgLookup | null = null;
		for (const command of commands) {
			row = await writeControlMethodCommand(trx, command);
		}
		return row;
	});
}

async function writeControlMethodCommand(
	db: ControlMethodTransaction,
	command: ControlMethodCommand,
): Promise<SafeOrgLookup | null> {
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
): Promise<SafeOrgLookup> {
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
		.returning([
			'id',
			'organization_id',
			'name',
			'custom_schema',
			'is_active',
			'created_at',
			'updated_at',
		])
		.executeTakeFirstOrThrow();

	return toSafeControlMethod(row);
}

async function updateControlMethod(
	db: ControlMethodTransaction,
	table: ControlMethodTableName,
	methodId: string,
	input: ControlMethodUpdateInput,
): Promise<SafeOrgLookup | null> {
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
		.returning([
			'id',
			'organization_id',
			'name',
			'custom_schema',
			'is_active',
			'created_at',
			'updated_at',
		])
		.executeTakeFirst();

	return row === undefined ? null : toSafeControlMethod(row);
}

async function setControlMethodActive(
	db: ControlMethodTransaction,
	table: ControlMethodTableName,
	methodId: string,
	input: ControlMethodLifecycleInput & { readonly isActive: boolean },
): Promise<SafeOrgLookup | null> {
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
		.returning([
			'id',
			'organization_id',
			'name',
			'custom_schema',
			'is_active',
			'created_at',
			'updated_at',
		])
		.executeTakeFirst();

	return row === undefined ? null : toSafeControlMethod(row);
}

async function deleteControlMethod(
	db: ControlMethodTransaction,
	table: ControlMethodTableName,
	methodId: string,
	input: ControlMethodLifecycleInput,
): Promise<SafeOrgLookup | null> {
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
		.returning([
			'id',
			'organization_id',
			'name',
			'custom_schema',
			'is_active',
			'created_at',
			'updated_at',
		])
		.executeTakeFirst();

	return row === undefined ? null : toSafeControlMethod(row);
}

function buildCreateCommand(
	kind: ControlMethodKind,
	authContext: AuthContext,
	payload: ControlMethodCreatePayload,
): ControlMethodCommand {
	const context = agencyCommandContext(authContext);
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
):
	| { readonly ok: true; readonly commands: readonly ControlMethodCommand[] }
	| { readonly ok: false; readonly body: InvalidCommandBody } {
	const commands: ControlMethodCommand[] = [];
	const hasDetailChange = payload.name !== undefined || payload.customSchema !== undefined;
	const context = agencyCommandContext(authContext);

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
		return invalidUpdateCommand('control method');
	}

	return { ok: true, commands };
}

function buildDetailUpdateCommand(
	kind: ControlMethodKind,
	context: ReturnType<typeof agencyCommandContext>,
	methodId: string,
	payload: ControlMethodUpdatePayload,
): ControlMethodCommand {
	const changes = {
		...context,
		...(payload.name === undefined ? {} : { name: payload.name }),
		...(payload.customSchema === undefined ? {} : { customSchema: payload.customSchema }),
		acknowledgedHistoricalLabelChange: true,
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
	context: ReturnType<typeof agencyCommandContext>,
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
	const context = agencyCommandContext(authContext);
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

function createCommand<TCommand extends ControlMethodCommand>(
	build: () => TCommand,
):
	| { readonly ok: true; readonly command: TCommand }
	| { readonly ok: false; readonly body: InvalidCommandBody } {
	try {
		return { ok: true, command: build() };
	} catch (error) {
		if (error instanceof DomainValidationError) {
			return {
				ok: false,
				body: {
					error: 'invalid_command',
					message: error.message,
					issues: error.issues,
				},
			};
		}

		throw error;
	}
}

type InvalidCommandBody = {
	readonly error: 'invalid_command';
	readonly message: string;
	readonly issues: readonly { readonly path: string; readonly message: string }[];
};

interface ControlMethodCreatePayload {
	readonly id: string;
	readonly name: string;
	readonly customSchema: unknown | null;
}

interface ControlMethodUpdatePayload {
	readonly name?: string;
	readonly customSchema?: unknown | null;
	readonly isActive?: boolean;
}

type PayloadResult<T> =
	| { readonly ok: true; readonly payload: T }
	| { readonly ok: false; readonly reason: string };

async function readCreatePayload(request: {
	readonly json: () => Promise<unknown>;
}): Promise<PayloadResult<ControlMethodCreatePayload>> {
	const rawResult = await readJsonObject(request);
	if (!rawResult.ok) {
		return rawResult;
	}
	const raw = rawResult.payload;
	const id = readRequiredText(raw.id);
	const name = readRequiredText(raw.name);
	if (id === null || name === null) {
		return invalid('id and name are required.');
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

async function readUpdatePayload(request: {
	readonly json: () => Promise<unknown>;
}): Promise<PayloadResult<ControlMethodUpdatePayload>> {
	const rawResult = await readJsonObject(request);
	if (!rawResult.ok) {
		return rawResult;
	}
	const raw = rawResult.payload;
	if (raw.isActive !== undefined && typeof raw.isActive !== 'boolean') {
		return invalid('isActive must be a boolean.');
	}

	return {
		ok: true,
		payload: {
			...(raw.name === undefined ? {} : { name: readRequiredText(raw.name) ?? '' }),
			...(raw.customSchema === undefined
				? {}
				: { customSchema: readOptionalJson(raw.customSchema) }),
			...(raw.isActive === undefined ? {} : { isActive: raw.isActive }),
		},
	};
}

async function readJsonObject(request: {
	readonly json: () => Promise<unknown>;
}): Promise<PayloadResult<Record<string, unknown>>> {
	let raw: unknown;
	try {
		raw = await request.json();
	} catch {
		return invalid('Request body must be JSON.');
	}

	if (!isRecord(raw)) {
		return invalid('Request body must be an object.');
	}

	return { ok: true, payload: raw };
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

function invalid(reason: string): PayloadResult<never> {
	return { ok: false, reason };
}

function invalidUpdateCommand(changeNoun: string): {
	readonly ok: false;
	readonly body: InvalidCommandBody;
} {
	const message = `At least one ${changeNoun} field must change.`;
	return {
		ok: false,
		body: {
			error: 'invalid_command',
			message,
			issues: [{ path: 'changes', message }],
		},
	};
}

function agencyCommandContext(authContext: AuthContext) {
	return {
		organizationId: authContext.organization.id,
		actorProfileId: authContext.profile.id,
	};
}

function toSafeControlMethod(row: {
	readonly id: string;
	readonly organization_id: string;
	readonly name: string;
	readonly custom_schema: unknown | null;
	readonly is_active: boolean;
	readonly created_at: Date;
	readonly updated_at: Date;
}): SafeOrgLookup {
	return {
		id: row.id,
		organizationId: row.organization_id,
		name: row.name,
		description: null,
		customSchema: row.custom_schema,
		actionThreshold: null,
		isActive: row.is_active,
		createdByProfileId: null,
		updatedByProfileId: null,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

function toControlMethodResponse(row: SafeOrgLookup | null) {
	if (row === null) {
		return null;
	}

	return {
		id: row.id,
		organizationId: row.organizationId,
		name: row.name,
		customSchema: row.customSchema,
		isActive: row.isActive,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
	};
}
