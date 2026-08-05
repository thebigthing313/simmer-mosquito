import type { MutationWriteResult } from '@simmer-mosquito/db';
import {
	addChemicalApplicationBatchCommand,
	type ControlOperationsCommand,
	removeChemicalApplicationBatchCommand,
} from '@simmer-mosquito/domain';
import type { Hono } from 'hono';
import type { AuthVariables } from '../auth-middleware.js';
import { type CommandActor, denyUnauthorizedAgencyCommands } from '../command-permissions.js';
import {
	agencyCommandContext,
	applicationBatchReturnColumns,
	assertActionOwnership,
	type CommandContext,
	type ControlOperationsDb,
	commandActor,
	createCommand,
	handleCommandError,
	insertApplicationBatch,
	type RouteOptions,
	readCurrentTransactionId,
	readJsonObject,
	readText,
	type SafeApplicationBatch,
	softDelete,
	toSafeApplicationBatch,
} from './shared.js';

// ===========================================================================
// Chemical application batches
// ===========================================================================

export function registerApplicationBatchRoutes(
	app: Hono<{ Variables: AuthVariables }>,
	options: RouteOptions,
): void {
	app.post(
		'/control-operations/application-batches',
		options.authContextMiddleware,
		async (context) => {
			const raw = await readJsonObject(context.req);
			if (!raw.ok) {
				return context.json({ error: 'invalid_payload', reason: raw.reason }, 400);
			}
			const ctx = agencyCommandContext(context.get('authContext'));
			const result = createCommand(() =>
				addChemicalApplicationBatchCommand({
					...ctx,
					applicationBatchId: readText(raw.payload.id) ?? '',
					applicationId: readText(raw.payload.applicationId) ?? '',
					insecticideBatchId: readText(raw.payload.insecticideBatchId) ?? '',
				}),
			);
			if (!result.ok) {
				return context.json(result.body, 400);
			}
			return runApplicationBatchCommands(context, options.db, [result.command], 201);
		},
	);

	app.delete(
		'/control-operations/application-batches/:applicationBatchId',
		options.authContextMiddleware,
		async (context) => {
			const ctx = agencyCommandContext(context.get('authContext'));
			const result = createCommand(() =>
				removeChemicalApplicationBatchCommand({
					...ctx,
					applicationBatchId: context.req.param('applicationBatchId'),
				}),
			);
			if (!result.ok) {
				return context.json(result.body, 400);
			}
			return runApplicationBatchCommands(context, options.db, [result.command]);
		},
	);
}

async function runApplicationBatchCommands(
	context: CommandContext,
	db: ControlOperationsDb,
	commands: readonly ControlOperationsCommand[],
	createdStatus?: 201,
) {
	const denial = denyUnauthorizedAgencyCommands(context, commands);
	if (denial !== null) {
		return denial;
	}

	try {
		const result = await writeApplicationBatchCommands(
			db,
			commandActor(context.get('authContext')),
			commands,
		);
		if (result.row === null) {
			return context.json({ error: 'application_batch_not_found' }, 404);
		}
		return context.json({ applicationBatch: result.row, txid: result.txid }, createdStatus ?? 200);
	} catch (error) {
		return handleCommandError(context, error);
	}
}

async function writeApplicationBatchCommands(
	db: ControlOperationsDb,
	actor: CommandActor,
	commands: readonly ControlOperationsCommand[],
): Promise<MutationWriteResult<SafeApplicationBatch | null>> {
	return db.transaction().execute(async (trx) => {
		let row: SafeApplicationBatch | null = null;
		for (const command of commands) {
			await assertActionOwnership(trx, command, actor);
			if (command.type === 'controlOperations.addChemicalApplicationBatch') {
				row = await insertApplicationBatch(trx, {
					id: command.payload.applicationBatchId,
					organizationId: command.payload.organizationId,
					applicationId: command.payload.applicationId,
					insecticideBatchId: command.payload.insecticideBatchId,
					actorProfileId: command.payload.actorProfileId,
				});
			} else if (command.type === 'controlOperations.removeChemicalApplicationBatch') {
				row = await softDelete(
					trx,
					'application_batches',
					command.payload.applicationBatchId,
					command.payload.organizationId,
					command.payload.actorProfileId,
					applicationBatchReturnColumns,
					toSafeApplicationBatch,
				);
			} else {
				throw new Error(`Unsupported application batch command: ${command.type}`);
			}
		}
		return { row, txid: await readCurrentTransactionId(trx) };
	});
}
