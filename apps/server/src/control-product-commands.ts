import {
	type Kysely,
	type MutationWriteResult,
	type SimmerDatabase,
	sql,
	type Transaction,
} from '@simmer-mosquito/db';
import {
	type CreateInsecticideBatchCommand,
	type CreateInsecticideCommand,
	createInsecticideBatchCommand,
	createInsecticideCommand,
	type DeactivateInsecticideBatchCommand,
	type DeactivateInsecticideCommand,
	type DeleteInsecticideBatchCommand,
	type DeleteInsecticideCommand,
	DomainValidationError,
	deactivateInsecticideBatchCommand,
	deactivateInsecticideCommand,
	deleteInsecticideBatchCommand,
	deleteInsecticideCommand,
	type InsecticideType,
	type ReactivateInsecticideBatchCommand,
	type ReactivateInsecticideCommand,
	reactivateInsecticideBatchCommand,
	reactivateInsecticideCommand,
	type UpdateInsecticideBatchCommand,
	type UpdateInsecticideCommand,
	updateInsecticideBatchCommand,
	updateInsecticideCommand,
} from '@simmer-mosquito/domain';
import type { Hono, MiddlewareHandler } from 'hono';
import type { AuthContext } from './auth-context.js';
import type { AuthVariables } from './auth-middleware.js';
import {
	agencyCommandContext,
	type CommandContext,
	CommandError,
	type CommandsResult,
	commandEndpoint,
	createCommand,
	handleCommandError,
	invalidUpdate,
	type PayloadResult,
} from './command-endpoint.js';
import { isRecord } from './command-payload.js';
import { denyUnauthorizedAgencyCommands } from './command-permissions.js';
import { runCommands } from './command-write.js';

type ControlProductDb = Kysely<SimmerDatabase>;
type ControlProductTransaction = Transaction<SimmerDatabase>;
type InsecticideCommand =
	| CreateInsecticideCommand
	| UpdateInsecticideCommand
	| DeactivateInsecticideCommand
	| ReactivateInsecticideCommand
	| DeleteInsecticideCommand;
type InsecticideBatchCommand =
	| CreateInsecticideBatchCommand
	| UpdateInsecticideBatchCommand
	| DeactivateInsecticideBatchCommand
	| ReactivateInsecticideBatchCommand
	| DeleteInsecticideBatchCommand;

interface SafeInsecticide {
	readonly id: string;
	readonly organizationId: string;
	readonly tradeName: string;
	readonly activeIngredient: string;
	readonly type: InsecticideType;
	readonly registrationNumber: string;
	readonly defaultUnitId: string;
	readonly labelUrl: string | null;
	readonly msdsUrl: string | null;
	readonly shorthand: string | null;
	readonly metadata: unknown | null;
	readonly isActive: boolean;
	readonly createdAt: Date;
	readonly updatedAt: Date;
}

interface SafeInsecticideBatch {
	readonly id: string;
	readonly organizationId: string;
	readonly insecticideId: string;
	readonly batchName: string;
	readonly isActive: boolean;
	readonly createdAt: Date;
	readonly updatedAt: Date;
}

export function registerControlProductCommandRoutes(
	app: Hono<{ Variables: AuthVariables }>,
	options: {
		readonly db: ControlProductDb;
		readonly authContextMiddleware: MiddlewareHandler<{ Variables: AuthVariables }>;
	},
): void {
	const runInsecticide = (
		context: CommandContext,
		commands: readonly InsecticideCommand[],
		createdStatus?: 201,
	) =>
		runCommands(
			context,
			{
				db: options.db,
				write: async (trx, command) =>
					toInsecticideResponse(await writeInsecticideCommand(trx, command)),
				notFound: 'insecticide_not_found',
				key: 'insecticide',
			},
			commands,
			createdStatus,
		);

	const runBatch = (
		context: CommandContext,
		commands: readonly InsecticideBatchCommand[],
		createdStatus?: 201,
	) =>
		runCommands(
			context,
			{
				db: options.db,
				write: async (trx, command) =>
					toInsecticideBatchResponse(await writeInsecticideBatchCommand(trx, command)),
				notFound: 'insecticide_batch_not_found',
				key: 'batch',
			},
			commands,
			createdStatus,
		);

	app.post(
		'/control-products/insecticides',
		options.authContextMiddleware,
		commandEndpoint({
			readPayload: readInsecticidePayload,
			build: ({ payload, agency }) =>
				createInsecticideCommand({
					...agency,
					insecticideId: payload.id,
					tradeName: payload.tradeName ?? '',
					activeIngredient: payload.activeIngredient ?? '',
					type: payload.type ?? 'adulticide',
					registrationNumber: payload.registrationNumber ?? '',
					defaultUnitId: payload.defaultUnitId ?? '',
					labelUrl: payload.labelUrl ?? null,
					msdsUrl: payload.msdsUrl ?? null,
					shorthand: payload.shorthand ?? null,
					metadata: payload.metadata ?? null,
				}),
			run: (context, commands) => runInsecticide(context, commands, 201),
		}),
	);

	app.patch(
		'/control-products/insecticides/:insecticideId',
		options.authContextMiddleware,
		commandEndpoint({
			readPayload: readInsecticidePayload,
			build: ({ payload, authContext, param }) =>
				buildInsecticideUpdateCommands(authContext, param('insecticideId'), payload),
			run: runInsecticide,
		}),
	);

	app.delete(
		'/control-products/insecticides/:insecticideId',
		options.authContextMiddleware,
		commandEndpoint({
			body: 'none',
			build: ({ agency, param }) =>
				deleteInsecticideCommand({ ...agency, insecticideId: param('insecticideId') }),
			run: runInsecticide,
		}),
	);

	app.post(
		'/control-products/insecticide-batches',
		options.authContextMiddleware,
		commandEndpoint({
			readPayload: readInsecticideBatchPayload,
			build: ({ payload, agency }) =>
				createInsecticideBatchCommand({
					...agency,
					insecticideBatchId: payload.id,
					insecticideId: payload.insecticideId,
					batchName: payload.batchName ?? '',
				}),
			run: (context, commands) => runBatch(context, commands, 201),
		}),
	);

	app.patch(
		'/control-products/insecticide-batches/:batchId',
		options.authContextMiddleware,
		commandEndpoint({
			readPayload: readInsecticideBatchPayload,
			build: ({ payload, authContext, param }) =>
				buildInsecticideBatchUpdateCommands(authContext, param('batchId'), payload),
			run: runBatch,
		}),
	);

	app.delete(
		'/control-products/insecticide-batches/:batchId',
		options.authContextMiddleware,
		commandEndpoint({
			body: 'none',
			build: ({ agency, param }) =>
				deleteInsecticideBatchCommand({ ...agency, insecticideBatchId: param('batchId') }),
			run: runBatch,
		}),
	);
}

function buildInsecticideUpdateCommands(
	authContext: AuthContext,
	insecticideId: string,
	payload: InsecticidePayload,
): CommandsResult<InsecticideCommand> {
	const commands: InsecticideCommand[] = [];
	const context = agencyCommandContext(authContext);
	const hasDetailChange =
		payload.tradeName !== undefined ||
		payload.activeIngredient !== undefined ||
		payload.type !== undefined ||
		payload.registrationNumber !== undefined ||
		payload.defaultUnitId !== undefined ||
		payload.labelUrl !== undefined ||
		payload.msdsUrl !== undefined ||
		payload.shorthand !== undefined ||
		payload.metadata !== undefined;

	if (hasDetailChange) {
		const commandResult = createCommand(() =>
			updateInsecticideCommand({
				...context,
				insecticideId,
				...(payload.tradeName === undefined ? {} : { tradeName: payload.tradeName }),
				...(payload.activeIngredient === undefined
					? {}
					: { activeIngredient: payload.activeIngredient }),
				...(payload.type === undefined ? {} : { type: payload.type }),
				...(payload.registrationNumber === undefined
					? {}
					: { registrationNumber: payload.registrationNumber }),
				...(payload.defaultUnitId === undefined ? {} : { defaultUnitId: payload.defaultUnitId }),
				...(payload.labelUrl === undefined ? {} : { labelUrl: payload.labelUrl }),
				...(payload.msdsUrl === undefined ? {} : { msdsUrl: payload.msdsUrl }),
				...(payload.shorthand === undefined ? {} : { shorthand: payload.shorthand }),
				...(payload.metadata === undefined ? {} : { metadata: payload.metadata }),
				acknowledgedHistoricalProductChange: true,
			}),
		);
		if (!commandResult.ok) {
			return commandResult;
		}
		commands.push(commandResult.command);
	}

	if (payload.isActive !== undefined) {
		const commandResult = createCommand(() =>
			payload.isActive
				? reactivateInsecticideCommand({ ...context, insecticideId })
				: deactivateInsecticideCommand({
						...context,
						insecticideId,
						acknowledgedDependentDeactivation: true,
					}),
		);
		if (!commandResult.ok) {
			return commandResult;
		}
		commands.push(commandResult.command);
	}

	return commands.length === 0 ? invalidUpdate('insecticide') : { ok: true, commands };
}

function buildInsecticideBatchUpdateCommands(
	authContext: AuthContext,
	batchId: string,
	payload: InsecticideBatchPayload,
): CommandsResult<InsecticideBatchCommand> {
	const commands: InsecticideBatchCommand[] = [];
	const context = agencyCommandContext(authContext);

	if (payload.batchName !== undefined) {
		const commandResult = createCommand(() =>
			updateInsecticideBatchCommand({
				...context,
				insecticideBatchId: batchId,
				batchName: payload.batchName ?? '',
				acknowledgedHistoricalBatchLabelChange: true,
			}),
		);
		if (!commandResult.ok) {
			return commandResult;
		}
		commands.push(commandResult.command);
	}

	if (payload.isActive !== undefined) {
		const commandResult = createCommand(() =>
			payload.isActive
				? reactivateInsecticideBatchCommand({ ...context, insecticideBatchId: batchId })
				: deactivateInsecticideBatchCommand({ ...context, insecticideBatchId: batchId }),
		);
		if (!commandResult.ok) {
			return commandResult;
		}
		commands.push(commandResult.command);
	}

	return commands.length === 0 ? invalidUpdate('insecticide batch') : { ok: true, commands };
}

async function writeInsecticideCommand(
	db: ControlProductTransaction,
	command: InsecticideCommand,
): Promise<SafeInsecticide | null> {
	switch (command.type) {
		case 'controlOperations.createInsecticide':
			return createInsecticide(db, {
				id: command.payload.insecticideId,
				organizationId: command.payload.organizationId,
				tradeName: command.payload.tradeName,
				activeIngredient: command.payload.activeIngredient,
				type: command.payload.type,
				registrationNumber: command.payload.registrationNumber,
				defaultUnitId: command.payload.defaultUnitId,
				labelUrl: command.payload.labelUrl,
				msdsUrl: command.payload.msdsUrl,
				shorthand: command.payload.shorthand,
				metadata: command.payload.metadata,
				isActive: true,
				actorProfileId: command.payload.actorProfileId,
			});
		case 'controlOperations.updateInsecticide':
			return updateInsecticide(db, command.payload.insecticideId, {
				organizationId: command.payload.organizationId,
				...command.payload.changes,
				actorProfileId: command.payload.actorProfileId,
			});
		case 'controlOperations.deactivateInsecticide':
			return setInsecticideActive(db, command.payload.insecticideId, {
				organizationId: command.payload.organizationId,
				actorProfileId: command.payload.actorProfileId,
				isActive: false,
			});
		case 'controlOperations.reactivateInsecticide':
			return setInsecticideActive(db, command.payload.insecticideId, {
				organizationId: command.payload.organizationId,
				actorProfileId: command.payload.actorProfileId,
				isActive: true,
			});
		case 'controlOperations.deleteInsecticide':
			return deleteInsecticide(db, command.payload.insecticideId, {
				organizationId: command.payload.organizationId,
				actorProfileId: command.payload.actorProfileId,
			});
	}
}

async function writeInsecticideBatchCommand(
	db: ControlProductTransaction,
	command: InsecticideBatchCommand,
): Promise<SafeInsecticideBatch | null> {
	switch (command.type) {
		case 'controlOperations.createInsecticideBatch':
			return createInsecticideBatch(db, {
				id: command.payload.insecticideBatchId,
				organizationId: command.payload.organizationId,
				insecticideId: command.payload.insecticideId,
				batchName: command.payload.batchName,
				isActive: true,
				actorProfileId: command.payload.actorProfileId,
			});
		case 'controlOperations.updateInsecticideBatch':
			return updateInsecticideBatch(db, command.payload.insecticideBatchId, {
				organizationId: command.payload.organizationId,
				...command.payload.changes,
				actorProfileId: command.payload.actorProfileId,
			});
		case 'controlOperations.deactivateInsecticideBatch':
			return setInsecticideBatchActive(db, command.payload.insecticideBatchId, {
				organizationId: command.payload.organizationId,
				actorProfileId: command.payload.actorProfileId,
				isActive: false,
			});
		case 'controlOperations.reactivateInsecticideBatch':
			return setInsecticideBatchActive(db, command.payload.insecticideBatchId, {
				organizationId: command.payload.organizationId,
				actorProfileId: command.payload.actorProfileId,
				isActive: true,
			});
		case 'controlOperations.deleteInsecticideBatch':
			return deleteInsecticideBatch(db, command.payload.insecticideBatchId, {
				organizationId: command.payload.organizationId,
				actorProfileId: command.payload.actorProfileId,
			});
	}
}

interface InsecticideWriteInput {
	readonly id: string;
	readonly organizationId: string;
	readonly tradeName: string;
	readonly activeIngredient: string;
	readonly type: InsecticideType;
	readonly registrationNumber: string;
	readonly defaultUnitId: string;
	readonly labelUrl: string | null;
	readonly msdsUrl: string | null;
	readonly shorthand: string | null;
	readonly metadata: unknown | null;
	readonly isActive: boolean;
	readonly actorProfileId: string;
}

interface InsecticideUpdateInput {
	readonly organizationId: string;
	readonly tradeName?: string;
	readonly activeIngredient?: string;
	readonly type?: InsecticideType;
	readonly registrationNumber?: string;
	readonly defaultUnitId?: string;
	readonly labelUrl?: string | null;
	readonly msdsUrl?: string | null;
	readonly shorthand?: string | null;
	readonly metadata?: unknown | null;
	readonly actorProfileId: string;
}

interface ProductLifecycleInput {
	readonly organizationId: string;
	readonly actorProfileId: string;
}

async function createInsecticide(
	db: ControlProductTransaction,
	input: InsecticideWriteInput,
): Promise<SafeInsecticide> {
	const row = await db
		.insertInto('insecticides')
		.values({
			id: input.id,
			organization_id: input.organizationId,
			trade_name: input.tradeName,
			active_ingredient: input.activeIngredient,
			type: input.type,
			registration_number: input.registrationNumber,
			default_unit_id: input.defaultUnitId,
			label_url: input.labelUrl,
			msds_url: input.msdsUrl,
			shorthand: input.shorthand,
			metadata: input.metadata,
			is_active: input.isActive,
			created_by_profile_id: input.actorProfileId,
			updated_by_profile_id: input.actorProfileId,
		})
		.returning(insecticideReturnColumns)
		.executeTakeFirstOrThrow();

	return toSafeInsecticide(row);
}

async function updateInsecticide(
	db: ControlProductTransaction,
	insecticideId: string,
	input: InsecticideUpdateInput,
): Promise<SafeInsecticide | null> {
	const row = await db
		.updateTable('insecticides')
		.set({
			...(input.tradeName === undefined ? {} : { trade_name: input.tradeName }),
			...(input.activeIngredient === undefined
				? {}
				: { active_ingredient: input.activeIngredient }),
			...(input.type === undefined ? {} : { type: input.type }),
			...(input.registrationNumber === undefined
				? {}
				: { registration_number: input.registrationNumber }),
			...(input.defaultUnitId === undefined ? {} : { default_unit_id: input.defaultUnitId }),
			...(input.labelUrl === undefined ? {} : { label_url: input.labelUrl }),
			...(input.msdsUrl === undefined ? {} : { msds_url: input.msdsUrl }),
			...(input.shorthand === undefined ? {} : { shorthand: input.shorthand }),
			...(input.metadata === undefined ? {} : { metadata: input.metadata }),
			updated_by_profile_id: input.actorProfileId,
			updated_at: sql`now()`,
		})
		.where('id', '=', insecticideId)
		.where('organization_id', '=', input.organizationId)
		.where('deleted_at', 'is', null)
		.returning(insecticideReturnColumns)
		.executeTakeFirst();

	return row === undefined ? null : toSafeInsecticide(row);
}

async function setInsecticideActive(
	db: ControlProductTransaction,
	insecticideId: string,
	input: ProductLifecycleInput & { readonly isActive: boolean },
): Promise<SafeInsecticide | null> {
	const row = await db
		.updateTable('insecticides')
		.set({
			is_active: input.isActive,
			updated_by_profile_id: input.actorProfileId,
			updated_at: sql`now()`,
		})
		.where('id', '=', insecticideId)
		.where('organization_id', '=', input.organizationId)
		.where('deleted_at', 'is', null)
		.returning(insecticideReturnColumns)
		.executeTakeFirst();

	return row === undefined ? null : toSafeInsecticide(row);
}

async function deleteInsecticide(
	db: ControlProductTransaction,
	insecticideId: string,
	input: ProductLifecycleInput,
): Promise<SafeInsecticide | null> {
	const row = await db
		.updateTable('insecticides')
		.set({
			deleted_at: sql`now()`,
			deleted_by_profile_id: input.actorProfileId,
			updated_by_profile_id: input.actorProfileId,
			updated_at: sql`now()`,
		})
		.where('id', '=', insecticideId)
		.where('organization_id', '=', input.organizationId)
		.where('deleted_at', 'is', null)
		.returning(insecticideReturnColumns)
		.executeTakeFirst();

	return row === undefined ? null : toSafeInsecticide(row);
}

interface InsecticideBatchWriteInput {
	readonly id: string;
	readonly organizationId: string;
	readonly insecticideId: string;
	readonly batchName: string;
	readonly isActive: boolean;
	readonly actorProfileId: string;
}

interface InsecticideBatchUpdateInput extends ProductLifecycleInput {
	readonly batchName?: string;
}

async function createInsecticideBatch(
	db: ControlProductTransaction,
	input: InsecticideBatchWriteInput,
): Promise<SafeInsecticideBatch> {
	await assertInsecticideBelongsToOrganization(db, input.insecticideId, input.organizationId);

	const row = await db
		.insertInto('insecticide_batches')
		.values({
			id: input.id,
			organization_id: input.organizationId,
			insecticide_id: input.insecticideId,
			batch_name: input.batchName,
			is_active: input.isActive,
			created_by_profile_id: input.actorProfileId,
			updated_by_profile_id: input.actorProfileId,
		})
		.returning(insecticideBatchReturnColumns)
		.executeTakeFirstOrThrow();

	return toSafeInsecticideBatch(row);
}

async function updateInsecticideBatch(
	db: ControlProductTransaction,
	batchId: string,
	input: InsecticideBatchUpdateInput,
): Promise<SafeInsecticideBatch | null> {
	const row = await db
		.updateTable('insecticide_batches')
		.set({
			...(input.batchName === undefined ? {} : { batch_name: input.batchName }),
			updated_by_profile_id: input.actorProfileId,
			updated_at: sql`now()`,
		})
		.where('id', '=', batchId)
		.where('organization_id', '=', input.organizationId)
		.where('deleted_at', 'is', null)
		.returning(insecticideBatchReturnColumns)
		.executeTakeFirst();

	return row === undefined ? null : toSafeInsecticideBatch(row);
}

async function setInsecticideBatchActive(
	db: ControlProductTransaction,
	batchId: string,
	input: ProductLifecycleInput & { readonly isActive: boolean },
): Promise<SafeInsecticideBatch | null> {
	const row = await db
		.updateTable('insecticide_batches')
		.set({
			is_active: input.isActive,
			updated_by_profile_id: input.actorProfileId,
			updated_at: sql`now()`,
		})
		.where('id', '=', batchId)
		.where('organization_id', '=', input.organizationId)
		.where('deleted_at', 'is', null)
		.returning(insecticideBatchReturnColumns)
		.executeTakeFirst();

	return row === undefined ? null : toSafeInsecticideBatch(row);
}

async function deleteInsecticideBatch(
	db: ControlProductTransaction,
	batchId: string,
	input: ProductLifecycleInput,
): Promise<SafeInsecticideBatch | null> {
	const row = await db
		.updateTable('insecticide_batches')
		.set({
			deleted_at: sql`now()`,
			deleted_by_profile_id: input.actorProfileId,
			updated_by_profile_id: input.actorProfileId,
			updated_at: sql`now()`,
		})
		.where('id', '=', batchId)
		.where('organization_id', '=', input.organizationId)
		.where('deleted_at', 'is', null)
		.returning(insecticideBatchReturnColumns)
		.executeTakeFirst();

	return row === undefined ? null : toSafeInsecticideBatch(row);
}

async function assertInsecticideBelongsToOrganization(
	db: ControlProductTransaction,
	insecticideId: string,
	organizationId: string,
): Promise<void> {
	const row = await db
		.selectFrom('insecticides')
		.select('insecticides.id')
		.where('insecticides.id', '=', insecticideId)
		.where('insecticides.organization_id', '=', organizationId)
		.where('insecticides.deleted_at', 'is', null)
		.executeTakeFirst();

	if (row === undefined) {
		// A `CommandError` rather than a bare `Error`: this is reached with an id
		// that belongs to another agency, to a soft-deleted row, or to nothing at
		// all, and all three are the caller's 404 rather than the server's 500.
		// The three cases answer alike on purpose — a refusal that told them apart
		// would let a caller probe for insecticide ids in other agencies.
		throw new CommandError(404, {
			error: 'insecticide_not_found',
			reason: 'An insecticide batch must belong to an insecticide in this organization.',
		});
	}
}

interface InsecticidePayload {
	readonly id: string;
	readonly tradeName?: string;
	readonly activeIngredient?: string;
	readonly type?: InsecticideType;
	readonly registrationNumber?: string;
	readonly defaultUnitId?: string;
	readonly labelUrl?: string | null;
	readonly msdsUrl?: string | null;
	readonly shorthand?: string | null;
	readonly metadata?: unknown | null;
	readonly isActive?: boolean;
}

interface InsecticideBatchPayload {
	readonly id: string;
	readonly insecticideId: string;
	readonly batchName?: string;
	readonly isActive?: boolean;
}

function readInsecticidePayload(raw: Record<string, unknown>): PayloadResult<InsecticidePayload> {
	if (raw.isActive !== undefined && typeof raw.isActive !== 'boolean') {
		return invalidPayload('isActive must be a boolean.');
	}
	const type = readInsecticideType(raw.type);
	if (raw.type !== undefined && type === null) {
		return invalidPayload('type must be larvicide, adulticide, pupicide, or other.');
	}

	return {
		ok: true,
		payload: {
			id: readRequiredText(raw.id) ?? '',
			...(raw.tradeName === undefined ? {} : { tradeName: readRequiredText(raw.tradeName) ?? '' }),
			...(raw.activeIngredient === undefined
				? {}
				: { activeIngredient: readRequiredText(raw.activeIngredient) ?? '' }),
			...(type === null ? {} : { type }),
			...(raw.registrationNumber === undefined
				? {}
				: { registrationNumber: readRequiredText(raw.registrationNumber) ?? '' }),
			...(raw.defaultUnitId === undefined
				? {}
				: { defaultUnitId: readRequiredText(raw.defaultUnitId) ?? '' }),
			...(raw.labelUrl === undefined ? {} : { labelUrl: readOptionalText(raw.labelUrl) }),
			...(raw.msdsUrl === undefined ? {} : { msdsUrl: readOptionalText(raw.msdsUrl) }),
			...(raw.shorthand === undefined ? {} : { shorthand: readOptionalText(raw.shorthand) }),
			...(raw.metadata === undefined ? {} : { metadata: readOptionalJson(raw.metadata) }),
			...(raw.isActive === undefined ? {} : { isActive: raw.isActive }),
		},
	};
}

function readInsecticideBatchPayload(
	raw: Record<string, unknown>,
): PayloadResult<InsecticideBatchPayload> {
	if (raw.isActive !== undefined && typeof raw.isActive !== 'boolean') {
		return invalidPayload('isActive must be a boolean.');
	}

	return {
		ok: true,
		payload: {
			id: readRequiredText(raw.id) ?? '',
			insecticideId: readRequiredText(raw.insecticideId) ?? '',
			...(raw.batchName === undefined ? {} : { batchName: readRequiredText(raw.batchName) ?? '' }),
			...(raw.isActive === undefined ? {} : { isActive: raw.isActive }),
		},
	};
}

function readInsecticideType(value: unknown): InsecticideType | null {
	return value === 'larvicide' ||
		value === 'adulticide' ||
		value === 'pupicide' ||
		value === 'other'
		? value
		: null;
}

function readRequiredText(value: unknown): string | null {
	if (typeof value !== 'string') {
		return null;
	}

	const trimmed = value.trim();
	return trimmed.length === 0 ? null : trimmed;
}

function readOptionalText(value: unknown): string | null {
	return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function readOptionalJson(value: unknown): unknown | null {
	return value === undefined ? null : value;
}

function invalidPayload(reason: string): PayloadResult<never> {
	return { ok: false, reason };
}

const insecticideReturnColumns = [
	'id',
	'organization_id',
	'trade_name',
	'active_ingredient',
	'type',
	'registration_number',
	'default_unit_id',
	'label_url',
	'msds_url',
	'shorthand',
	'metadata',
	'is_active',
	'created_at',
	'updated_at',
] as const;

const insecticideBatchReturnColumns = [
	'id',
	'organization_id',
	'insecticide_id',
	'batch_name',
	'is_active',
	'created_at',
	'updated_at',
] as const;

function toSafeInsecticide(row: {
	readonly id: string;
	readonly organization_id: string;
	readonly trade_name: string;
	readonly active_ingredient: string;
	readonly type: InsecticideType;
	readonly registration_number: string;
	readonly default_unit_id: string;
	readonly label_url: string | null;
	readonly msds_url: string | null;
	readonly shorthand: string | null;
	readonly metadata: unknown | null;
	readonly is_active: boolean;
	readonly created_at: Date;
	readonly updated_at: Date;
}): SafeInsecticide {
	return {
		id: row.id,
		organizationId: row.organization_id,
		tradeName: row.trade_name,
		activeIngredient: row.active_ingredient,
		type: row.type,
		registrationNumber: row.registration_number,
		defaultUnitId: row.default_unit_id,
		labelUrl: row.label_url,
		msdsUrl: row.msds_url,
		shorthand: row.shorthand,
		metadata: row.metadata,
		isActive: row.is_active,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

function toSafeInsecticideBatch(row: {
	readonly id: string;
	readonly organization_id: string;
	readonly insecticide_id: string;
	readonly batch_name: string;
	readonly is_active: boolean;
	readonly created_at: Date;
	readonly updated_at: Date;
}): SafeInsecticideBatch {
	return {
		id: row.id,
		organizationId: row.organization_id,
		insecticideId: row.insecticide_id,
		batchName: row.batch_name,
		isActive: row.is_active,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

function toInsecticideResponse(row: SafeInsecticide | null) {
	return row;
}

function toInsecticideBatchResponse(row: SafeInsecticideBatch | null) {
	return row;
}
