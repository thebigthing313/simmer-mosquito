import type { MutationWriteResult } from '@simmer-mosquito/db';
import {
	addChemicalApplicationBatchCommand,
	type ControlOperationsCommand,
	removeChemicalApplicationBatchCommand,
} from '@simmer-mosquito/domain';
import type { Hono } from 'hono';
import type { AuthVariables } from '../auth-middleware.js';
import { readText } from '../command-payload.js';
import { type CommandActor, denyUnauthorizedAgencyCommands } from '../command-permissions.js';
import {
	applicationBatchReturnColumns,
	assertActionOwnership,
	type CommandContext,
	type ControlOperationsDb,
	commandActor,
	commandEndpoint,
	handleCommandError,
	insertApplicationBatch,
	type RouteOptions,
	readCurrentTransactionId,
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
		commandEndpoint({
			build: ({ payload, agency: ctx }) =>
				addChemicalApplicationBatchCommand({
					...ctx,
					applicationBatchId: readText(payload.id) ?? '',
					applicationId: readText(payload.applicationId) ?? '',
					insecticideBatchId: readText(payload.insecticideBatchId) ?? '',
				}),
			run: (context, commands) => runApplicationBatchCommands(context, options.db, commands, 201),
		}),
	);

	app.delete(
		'/control-operations/application-batches/:applicationBatchId',
		options.authContextMiddleware,
		commandEndpoint({
			body: 'none',
			build: ({ agency: ctx, param }) =>
				removeChemicalApplicationBatchCommand({
					...ctx,
					applicationBatchId: param('applicationBatchId'),
				}),
			run: (context, commands) => runApplicationBatchCommands(context, options.db, commands),
		}),
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
