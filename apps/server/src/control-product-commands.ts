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
import { denyUnauthorizedAgencyCommands } from './command-permissions.js';

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
	app.post('/control-products/insecticides', options.authContextMiddleware, async (context) => {
		const payloadResult = await readInsecticidePayload(context.req);
		if (!payloadResult.ok) {
			return context.json({ error: 'invalid_payload', reason: payloadResult.reason }, 400);
		}

		const commandResult = createCommand(() =>
			createInsecticideCommand({
				...agencyCommandContext(context.get('authContext')),
				insecticideId: payloadResult.payload.id,
				tradeName: payloadResult.payload.tradeName ?? '',
				activeIngredient: payloadResult.payload.activeIngredient ?? '',
				type: payloadResult.payload.type ?? 'adulticide',
				registrationNumber: payloadResult.payload.registrationNumber ?? '',
				defaultUnitId: payloadResult.payload.defaultUnitId ?? '',
				labelUrl: payloadResult.payload.labelUrl ?? null,
				msdsUrl: payloadResult.payload.msdsUrl ?? null,
				shorthand: payloadResult.payload.shorthand ?? null,
				metadata: payloadResult.payload.metadata ?? null,
			}),
		);
		if (!commandResult.ok) {
			return context.json(commandResult.body, 400);
		}

		const denial = denyUnauthorizedAgencyCommands(context, [commandResult.command]);
		if (denial !== null) {
			return denial;
		}

		const result = await writeInsecticideCommands(options.db, [commandResult.command]);
		return context.json({ insecticide: toInsecticideResponse(result.row), txid: result.txid }, 201);
	});

	app.patch(
		'/control-products/insecticides/:insecticideId',
		options.authContextMiddleware,
		async (context) => {
			const payloadResult = await readInsecticidePayload(context.req);
			if (!payloadResult.ok) {
				return context.json({ error: 'invalid_payload', reason: payloadResult.reason }, 400);
			}

			const commandsResult = buildInsecticideUpdateCommands(
				context.get('authContext'),
				context.req.param('insecticideId'),
				payloadResult.payload,
			);
			if (!commandsResult.ok) {
				return context.json(commandsResult.body, 400);
			}

			const denial = denyUnauthorizedAgencyCommands(context, commandsResult.commands);
			if (denial !== null) {
				return denial;
			}

			const result = await writeInsecticideCommands(options.db, commandsResult.commands);
			if (result.row === null) {
				return context.json({ error: 'insecticide_not_found' }, 404);
			}

			return context.json({ insecticide: toInsecticideResponse(result.row), txid: result.txid });
		},
	);

	app.delete(
		'/control-products/insecticides/:insecticideId',
		options.authContextMiddleware,
		async (context) => {
			const commandResult = createCommand(() =>
				deleteInsecticideCommand({
					...agencyCommandContext(context.get('authContext')),
					insecticideId: context.req.param('insecticideId'),
				}),
			);
			if (!commandResult.ok) {
				return context.json(commandResult.body, 400);
			}

			const denial = denyUnauthorizedAgencyCommands(context, [commandResult.command]);
			if (denial !== null) {
				return denial;
			}

			const result = await writeInsecticideCommands(options.db, [commandResult.command]);
			if (result.row === null) {
				return context.json({ error: 'insecticide_not_found' }, 404);
			}

			return context.json({ insecticide: toInsecticideResponse(result.row), txid: result.txid });
		},
	);

	app.post(
		'/control-products/insecticide-batches',
		options.authContextMiddleware,
		async (context) => {
			const payloadResult = await readInsecticideBatchPayload(context.req);
			if (!payloadResult.ok) {
				return context.json({ error: 'invalid_payload', reason: payloadResult.reason }, 400);
			}

			const commandResult = createCommand(() =>
				createInsecticideBatchCommand({
					...agencyCommandContext(context.get('authContext')),
					insecticideBatchId: payloadResult.payload.id,
					insecticideId: payloadResult.payload.insecticideId,
					batchName: payloadResult.payload.batchName ?? '',
				}),
			);
			if (!commandResult.ok) {
				return context.json(commandResult.body, 400);
			}

			const denial = denyUnauthorizedAgencyCommands(context, [commandResult.command]);
			if (denial !== null) {
				return denial;
			}

			const result = await writeInsecticideBatchCommands(options.db, [commandResult.command]);
			return context.json(
				{ batch: toInsecticideBatchResponse(result.row), txid: result.txid },
				201,
			);
		},
	);

	app.patch(
		'/control-products/insecticide-batches/:batchId',
		options.authContextMiddleware,
		async (context) => {
			const payloadResult = await readInsecticideBatchPayload(context.req);
			if (!payloadResult.ok) {
				return context.json({ error: 'invalid_payload', reason: payloadResult.reason }, 400);
			}

			const commandsResult = buildInsecticideBatchUpdateCommands(
				context.get('authContext'),
				context.req.param('batchId'),
				payloadResult.payload,
			);
			if (!commandsResult.ok) {
				return context.json(commandsResult.body, 400);
			}

			const denial = denyUnauthorizedAgencyCommands(context, commandsResult.commands);
			if (denial !== null) {
				return denial;
			}

			const result = await writeInsecticideBatchCommands(options.db, commandsResult.commands);
			if (result.row === null) {
				return context.json({ error: 'insecticide_batch_not_found' }, 404);
			}

			return context.json({ batch: toInsecticideBatchResponse(result.row), txid: result.txid });
		},
	);

	app.delete(
		'/control-products/insecticide-batches/:batchId',
		options.authContextMiddleware,
		async (context) => {
			const commandResult = createCommand(() =>
				deleteInsecticideBatchCommand({
					...agencyCommandContext(context.get('authContext')),
					insecticideBatchId: context.req.param('batchId'),
				}),
			);
			if (!commandResult.ok) {
				return context.json(commandResult.body, 400);
			}

			const denial = denyUnauthorizedAgencyCommands(context, [commandResult.command]);
			if (denial !== null) {
				return denial;
			}

			const result = await writeInsecticideBatchCommands(options.db, [commandResult.command]);
			if (result.row === null) {
				return context.json({ error: 'insecticide_batch_not_found' }, 404);
			}

			return context.json({ batch: toInsecticideBatchResponse(result.row), txid: result.txid });
		},
	);
}

function buildInsecticideUpdateCommands(
	authContext: AuthContext,
	insecticideId: string,
	payload: InsecticidePayload,
):
	| { readonly ok: true; readonly commands: readonly InsecticideCommand[] }
	| { readonly ok: false; readonly body: InvalidCommandBody } {
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

	return commands.length === 0 ? invalidUpdateCommand('insecticide') : { ok: true, commands };
}

function buildInsecticideBatchUpdateCommands(
	authContext: AuthContext,
	batchId: string,
	payload: InsecticideBatchPayload,
):
	| { readonly ok: true; readonly commands: readonly InsecticideBatchCommand[] }
	| { readonly ok: false; readonly body: InvalidCommandBody } {
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

	return commands.length === 0 ? invalidUpdateCommand('insecticide batch') : { ok: true, commands };
}

async function writeInsecticideCommands(
	db: ControlProductDb,
	commands: readonly InsecticideCommand[],
): Promise<MutationWriteResult<SafeInsecticide | null>> {
	return db.transaction().execute(async (trx) => {
		let row: SafeInsecticide | null = null;
		for (const command of commands) {
			row = await writeInsecticideCommand(trx, command);
		}
		return { row, txid: await readCurrentTransactionId(trx) };
	});
}

async function writeInsecticideBatchCommands(
	db: ControlProductDb,
	commands: readonly InsecticideBatchCommand[],
): Promise<MutationWriteResult<SafeInsecticideBatch | null>> {
	return db.transaction().execute(async (trx) => {
		let row: SafeInsecticideBatch | null = null;
		for (const command of commands) {
			row = await writeInsecticideBatchCommand(trx, command);
		}
		return { row, txid: await readCurrentTransactionId(trx) };
	});
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
		throw new Error('Insecticide batch must belong to an insecticide in this organization.');
	}
}

function createCommand<TCommand extends InsecticideCommand | InsecticideBatchCommand>(
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

type PayloadResult<T> =
	| { readonly ok: true; readonly payload: T }
	| { readonly ok: false; readonly reason: string };

async function readInsecticidePayload(request: {
	readonly json: () => Promise<unknown>;
}): Promise<PayloadResult<InsecticidePayload>> {
	const rawResult = await readJsonObject(request);
	if (!rawResult.ok) {
		return rawResult;
	}
	const raw = rawResult.payload;
	if (raw.isActive !== undefined && typeof raw.isActive !== 'boolean') {
		return invalid('isActive must be a boolean.');
	}
	const type = readInsecticideType(raw.type);
	if (raw.type !== undefined && type === null) {
		return invalid('type must be larvicide, adulticide, pupicide, or other.');
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

async function readInsecticideBatchPayload(request: {
	readonly json: () => Promise<unknown>;
}): Promise<PayloadResult<InsecticideBatchPayload>> {
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
			id: readRequiredText(raw.id) ?? '',
			insecticideId: readRequiredText(raw.insecticideId) ?? '',
			...(raw.batchName === undefined ? {} : { batchName: readRequiredText(raw.batchName) ?? '' }),
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

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function agencyCommandContext(authContext: AuthContext) {
	return {
		organizationId: authContext.organization.id,
		actorProfileId: authContext.profile.id,
	};
}

async function readCurrentTransactionId(db: ControlProductTransaction): Promise<number> {
	const result = await sql<{
		txid: string;
	}>`select pg_current_xact_id()::xid::text as txid`.execute(db);
	const txid = result.rows[0]?.txid;
	if (txid === undefined) {
		throw new Error('Unable to read current transaction id.');
	}

	return Number.parseInt(txid, 10);
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
