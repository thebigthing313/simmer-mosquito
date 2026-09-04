import {
	assertClearanceAcknowledged,
	assertRecordDeletable,
	assertWriteReferences,
	type Kysely,
	type MutationWriteResult,
	type SelectedRow,
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
	INSECTICIDE_TYPES,
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
import { acknowledged, isRecord } from './command-payload.js';
import { denyUnauthorizedAgencyCommands } from './command-permissions.js';
import { runCommands } from './command-write.js';
import { assertCitedHistoryAcknowledged } from './record-history.js';

/**
 * The insecticide fields a past application is read back under.
 *
 * The list is `docs/control-operations-domain.md`'s, verbatim. The rest of the
 * update command's change set — the label and safety-sheet links, the
 * shorthand, the notes — describes the product rather than names it, so editing
 * one of those alone asks the agency nothing.
 */
const PRODUCT_IDENTITY_FIELDS = [
	'tradeName',
	'activeIngredient',
	'type',
	'registrationNumber',
	'defaultUnitId',
] as const;

type ControlProductDb = Kysely<SimmerDatabase>;
type ControlProductTransaction = Transaction<SimmerDatabase>;
export type InsecticideCommand =
	| CreateInsecticideCommand
	| UpdateInsecticideCommand
	| DeactivateInsecticideCommand
	| ReactivateInsecticideCommand
	| DeleteInsecticideCommand;
export type InsecticideBatchCommand =
	| CreateInsecticideBatchCommand
	| UpdateInsecticideBatchCommand
	| DeactivateInsecticideBatchCommand
	| ReactivateInsecticideBatchCommand
	| DeleteInsecticideBatchCommand;

type InsecticideRow = SelectedRow<'insecticides', typeof insecticideReturnColumns>;

type InsecticideBatchRow = SelectedRow<'insecticide_batches', typeof insecticideBatchReturnColumns>;

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
				write: async (trx, command) => await writeInsecticideCommand(trx, command),
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
				write: async (trx, command) => await writeInsecticideBatchCommand(trx, command),
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
				acknowledgedHistoricalProductChange: payload.acknowledgedHistoricalProductChange,
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
						acknowledgedDependentDeactivation: acknowledged(
							payload,
							'acknowledgedDependentDeactivation',
						),
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
				acknowledgedHistoricalBatchLabelChange: payload.acknowledgedHistoricalBatchLabelChange,
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

/**
 * Refuse retiring a product that other records are still using, unless the
 * agency said to (#341).
 *
 * Nothing is deleted here, which is why the sentence is not the removal one.
 * The batches of a retired product cannot be applied and the formulations
 * naming it cannot be mixed, so the write takes them out of use without
 * touching a row of either, and the count is the only way the agency sees that
 * before it happens.
 *
 * Both kinds arrive in one refusal rather than one per attempt: confirming
 * "3 batches" and then discovering the formulations is the same surprise this
 * is meant to prevent. The keys and the words are the delete registry's, so a
 * dialog reads the same whether the product is being retired or deleted.
 *
 * Only live batches count. A batch already out of use is not something this
 * write changes, and asking about it would be asking about nothing.
 */
async function assertDependentsAcknowledged(
	db: ControlProductTransaction,
	payload: {
		readonly insecticideId: string;
		readonly organizationId: string;
		readonly acknowledgedDependentDeactivation: boolean;
	},
): Promise<void> {
	await assertClearanceAcknowledged(db, {
		acknowledgement: 'acknowledgedDependentDeactivation',
		acknowledged: payload.acknowledgedDependentDeactivation === true,
		message: (counted) => `Retiring this product takes ${counted} out of use with it.`,
		rules: [
			{
				key: 'insecticideBatches',
				table: 'insecticide_batches',
				singular: 'batch',
				plural: 'batches',
				match: sql`insecticide_id = ${payload.insecticideId}
					and organization_id = ${payload.organizationId}
					and is_active = true
					and deleted_at is null`,
			},
			{
				key: 'insecticideFormulations',
				table: 'formulation_insecticides',
				singular: 'formulation',
				plural: 'formulations',
				match: sql`insecticide_id = ${payload.insecticideId}
					and organization_id = ${payload.organizationId}
					and deleted_at is null`,
			},
		],
	});
}

export async function writeInsecticideCommand(
	db: ControlProductTransaction,
	command: InsecticideCommand,
): Promise<InsecticideRow | null> {
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
			// An application stores `insecticide_id` and the quantity, never a copy
			// of the product's identity, so correcting the trade name, the active
			// ingredient, the EPA number, the type or the default unit rewrites how
			// every past application reads. The batches and the formulations that
			// name the product are counted with them: both are displayed under the
			// product's name too.
			await assertCitedHistoryAcknowledged(db, {
				recordType: 'insecticide',
				recordId: command.payload.insecticideId,
				organizationId: command.payload.organizationId,
				subject: 'insecticide',
				acknowledgement: 'acknowledgedHistoricalProductChange',
				acknowledged: command.payload.acknowledgedHistoricalProductChange,
				relabels: PRODUCT_IDENTITY_FIELDS.some(
					(field) => command.payload.changes[field] !== undefined,
				),
			});
			return updateInsecticide(db, command.payload.insecticideId, {
				organizationId: command.payload.organizationId,
				...command.payload.changes,
				actorProfileId: command.payload.actorProfileId,
			});
		case 'controlOperations.deactivateInsecticide':
			await assertDependentsAcknowledged(db, command.payload);
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

export async function writeInsecticideBatchCommand(
	db: ControlProductTransaction,
	command: InsecticideBatchCommand,
): Promise<InsecticideBatchRow | null> {
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
			// The batch name is the whole of what an application's batch link is read
			// back under, and it is the only field this command changes.
			await assertCitedHistoryAcknowledged(db, {
				recordType: 'insecticideBatch',
				recordId: command.payload.insecticideBatchId,
				organizationId: command.payload.organizationId,
				subject: 'batch',
				acknowledgement: 'acknowledgedHistoricalBatchLabelChange',
				acknowledged: command.payload.acknowledgedHistoricalBatchLabelChange,
				relabels: command.payload.changes.batchName !== undefined,
			});
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
): Promise<InsecticideRow> {
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

	return row;
}

async function updateInsecticide(
	db: ControlProductTransaction,
	insecticideId: string,
	input: InsecticideUpdateInput,
): Promise<InsecticideRow | null> {
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

	return row ?? null;
}

async function setInsecticideActive(
	db: ControlProductTransaction,
	insecticideId: string,
	input: ProductLifecycleInput & { readonly isActive: boolean },
): Promise<InsecticideRow | null> {
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

	return row ?? null;
}

async function deleteInsecticide(
	db: ControlProductTransaction,
	insecticideId: string,
	input: ProductLifecycleInput,
): Promise<InsecticideRow | null> {
	await assertRecordDeletable(db, {
		recordType: 'insecticide',
		recordId: insecticideId,
		organizationId: input.organizationId,
	});

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

	return row ?? null;
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
): Promise<InsecticideBatchRow> {
	await assertWriteReferences(db, {
		organizationId: input.organizationId,
		write: { kind: 'create' },
		references: [
			{
				column: 'insecticide_id',
				catalog: 'insecticide',
				id: input.insecticideId,
				label: 'insecticide',
			},
		],
	});

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

	return row;
}

async function updateInsecticideBatch(
	db: ControlProductTransaction,
	batchId: string,
	input: InsecticideBatchUpdateInput,
): Promise<InsecticideBatchRow | null> {
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

	return row ?? null;
}

async function setInsecticideBatchActive(
	db: ControlProductTransaction,
	batchId: string,
	input: ProductLifecycleInput & { readonly isActive: boolean },
): Promise<InsecticideBatchRow | null> {
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

	return row ?? null;
}

async function deleteInsecticideBatch(
	db: ControlProductTransaction,
	batchId: string,
	input: ProductLifecycleInput,
): Promise<InsecticideBatchRow | null> {
	await assertRecordDeletable(db, {
		recordType: 'insecticideBatch',
		recordId: batchId,
		organizationId: input.organizationId,
	});

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

	return row ?? null;
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
	readonly acknowledgedDependentDeactivation: boolean;
	readonly acknowledgedHistoricalProductChange: boolean;
}

interface InsecticideBatchPayload {
	readonly id: string;
	readonly insecticideId: string;
	readonly batchName?: string;
	readonly isActive?: boolean;
	readonly acknowledgedHistoricalBatchLabelChange: boolean;
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
			acknowledgedDependentDeactivation: acknowledged(raw, 'acknowledgedDependentDeactivation'),
			acknowledgedHistoricalProductChange: acknowledged(raw, 'acknowledgedHistoricalProductChange'),
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
			acknowledgedHistoricalBatchLabelChange: acknowledged(
				raw,
				'acknowledgedHistoricalBatchLabelChange',
			),
		},
	};
}

function readInsecticideType(value: unknown): InsecticideType | null {
	return INSECTICIDE_TYPES.includes(value as InsecticideType) ? (value as InsecticideType) : null;
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
