import {
	addChemicalApplicationBatchCommand,
	type ControlOperationsCommand,
	removeChemicalApplicationBatchCommand,
} from '@simmer-mosquito/domain';
import type { Hono } from 'hono';
import type { AuthVariables } from '../auth-middleware.js';
import { readText } from '../command-payload.js';
import { denyUnauthorizedAgencyCommands } from '../command-permissions.js';
import {
	applicationBatchReturnColumns,
	type CommandContext,
	type ControlOperationsDb,
	type ControlOperationsTransaction,
	commandActor,
	commandEndpoint,
	handleCommandError,
	insertApplicationBatch,
	type RouteOptions,
	type SafeApplicationBatch,
	softDelete,
	toSafeApplicationBatch,
	writeCommands,
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
		const result = await writeCommands(
			db,
			commandActor(context.get('authContext')),
			commands,
			writeApplicationBatchCommand,
		);
		if (result.row === null) {
			return context.json({ error: 'application_batch_not_found' }, 404);
		}
		return context.json({ applicationBatch: result.row, txid: result.txid }, createdStatus ?? 200);
	} catch (error) {
		return handleCommandError(context, error);
	}
}

async function writeApplicationBatchCommand(
	trx: ControlOperationsTransaction,
	command: ControlOperationsCommand,
): Promise<SafeApplicationBatch | null> {
	if (command.type === 'controlOperations.addChemicalApplicationBatch') {
		return insertApplicationBatch(trx, {
			id: command.payload.applicationBatchId,
			organizationId: command.payload.organizationId,
			applicationId: command.payload.applicationId,
			insecticideBatchId: command.payload.insecticideBatchId,
			actorProfileId: command.payload.actorProfileId,
		});
	}
	if (command.type === 'controlOperations.removeChemicalApplicationBatch') {
		return softDelete(
			trx,
			'application_batches',
			command.payload.applicationBatchId,
			command.payload.organizationId,
			command.payload.actorProfileId,
			applicationBatchReturnColumns,
			toSafeApplicationBatch,
		);
	}
	throw new Error(`Unsupported application batch command: ${command.type}`);
}
