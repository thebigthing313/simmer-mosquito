import { type MutationWriteResult, sql } from '@simmer-mosquito/db';
import {
	activateFormulationCommand,
	type ControlOperationsCommand,
	createFormulationCommand,
	deactivateFormulationCommand,
	deleteFormulationCommand,
	updateFormulationDetailsCommand,
} from '@simmer-mosquito/domain';
import type { Hono } from 'hono';
import type { AuthContext } from '../auth-context.js';
import type { AuthVariables } from '../auth-middleware.js';
import { readNullableText, readNumber, readText } from '../command-payload.js';
import { denyUnauthorizedAgencyCommands } from '../command-permissions.js';
import {
	agencyCommandContext,
	type CommandContext,
	type CommandsResult,
	type ControlOperationsDb,
	type ControlOperationsTransaction,
	commandEndpoint,
	createCommand,
	type FormulationUpdateColumns,
	formulationReturnColumns,
	handleCommandError,
	invalidUpdate,
	type RouteOptions,
	readCurrentTransactionId,
	type SafeFormulation,
	softDelete,
	toSafeFormulation,
} from './shared.js';

// ===========================================================================
// Formulations
// ===========================================================================

export function registerFormulationRoutes(
	app: Hono<{ Variables: AuthVariables }>,
	options: RouteOptions,
): void {
	app.post(
		'/control-operations/formulations',
		options.authContextMiddleware,
		commandEndpoint({
			build: ({ payload, agency: ctx }) =>
				createFormulationCommand({
					...ctx,
					formulationId: readText(payload.id) ?? '',
					formulationName: readText(payload.formulationName) ?? '',
					description: readNullableText(payload.description),
					batchSize: readNumber(payload.batchSize) ?? Number.NaN,
					batchUnitId: readText(payload.batchUnitId) ?? '',
				}),
			run: (context, commands) => runFormulationCommands(context, options.db, commands, 201),
		}),
	);

	app.patch(
		'/control-operations/formulations/:formulationId',
		options.authContextMiddleware,
		commandEndpoint({
			build: ({ payload, authContext, param }) =>
				buildFormulationUpdateCommands(authContext, param('formulationId'), payload),
			run: (context, commands) => runFormulationCommands(context, options.db, commands),
		}),
	);

	app.delete(
		'/control-operations/formulations/:formulationId',
		options.authContextMiddleware,
		commandEndpoint({
			body: 'none',
			build: ({ agency: ctx, param }) =>
				deleteFormulationCommand({
					...ctx,
					formulationId: param('formulationId'),
					acknowledgedComponentDeletion: true,
				}),
			run: (context, commands) => runFormulationCommands(context, options.db, commands),
		}),
	);
}

function buildFormulationUpdateCommands(
	authContext: AuthContext,
	formulationId: string,
	payload: Record<string, unknown>,
): CommandsResult {
	const ctx = agencyCommandContext(authContext);
	const commands: ControlOperationsCommand[] = [];

	const hasName = 'formulationName' in payload;
	const hasDescription = 'description' in payload;
	const hasBatchSize = 'batchSize' in payload;
	const hasBatchUnit = 'batchUnitId' in payload;
	if (hasName || hasDescription || hasBatchSize || hasBatchUnit) {
		const result = createCommand(() =>
			updateFormulationDetailsCommand({
				...ctx,
				formulationId,
				...(hasName ? { formulationName: readText(payload.formulationName) ?? '' } : {}),
				...(hasDescription ? { description: readNullableText(payload.description) } : {}),
				...(hasBatchSize ? { batchSize: readNumber(payload.batchSize) ?? Number.NaN } : {}),
				...(hasBatchUnit ? { batchUnitId: readText(payload.batchUnitId) ?? '' } : {}),
			}),
		);
		if (!result.ok) {
			return result;
		}
		commands.push(result.command);
	}

	if (typeof payload.isActive === 'boolean') {
		const result = createCommand(() =>
			payload.isActive
				? activateFormulationCommand({ ...ctx, formulationId })
				: deactivateFormulationCommand({ ...ctx, formulationId }),
		);
		if (!result.ok) {
			return result;
		}
		commands.push(result.command);
	}

	if (commands.length === 0) {
		return invalidUpdate('formulation');
	}
	return { ok: true, commands };
}

async function runFormulationCommands(
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
		const result = await writeFormulationCommands(db, commands);
		if (result.row === null) {
			return context.json({ error: 'formulation_not_found' }, 404);
		}
		return context.json({ formulation: result.row, txid: result.txid }, createdStatus ?? 200);
	} catch (error) {
		return handleCommandError(context, error);
	}
}

async function writeFormulationCommands(
	db: ControlOperationsDb,
	commands: readonly ControlOperationsCommand[],
): Promise<MutationWriteResult<SafeFormulation | null>> {
	return db.transaction().execute(async (trx) => {
		let row: SafeFormulation | null = null;
		for (const command of commands) {
			row = await writeFormulationCommand(trx, command);
		}
		return { row, txid: await readCurrentTransactionId(trx) };
	});
}

async function writeFormulationCommand(
	trx: ControlOperationsTransaction,
	command: ControlOperationsCommand,
): Promise<SafeFormulation | null> {
	switch (command.type) {
		case 'controlOperations.createFormulation': {
			const row = await trx
				.insertInto('formulations')
				.values({
					id: command.payload.formulationId,
					organization_id: command.payload.organizationId,
					formulation_name: command.payload.formulationName,
					description: command.payload.description,
					batch_size: command.payload.batchSize,
					batch_unit_id: command.payload.batchUnitId,
					is_active: true,
					created_by_profile_id: command.payload.actorProfileId,
					updated_by_profile_id: command.payload.actorProfileId,
				})
				.returning(formulationReturnColumns)
				.executeTakeFirstOrThrow();
			return toSafeFormulation(row);
		}
		case 'controlOperations.updateFormulationDetails':
			return updateFormulation(trx, command.payload.formulationId, command.payload.organizationId, {
				...('formulationName' in command.payload.changes
					? { formulation_name: command.payload.changes.formulationName }
					: {}),
				...('description' in command.payload.changes
					? { description: command.payload.changes.description ?? null }
					: {}),
				...('batchSize' in command.payload.changes
					? { batch_size: command.payload.changes.batchSize }
					: {}),
				...('batchUnitId' in command.payload.changes
					? { batch_unit_id: command.payload.changes.batchUnitId }
					: {}),
				updated_by_profile_id: command.payload.actorProfileId,
			});
		case 'controlOperations.activateFormulation':
			return updateFormulation(trx, command.payload.formulationId, command.payload.organizationId, {
				is_active: true,
				updated_by_profile_id: command.payload.actorProfileId,
			});
		case 'controlOperations.deactivateFormulation':
			return updateFormulation(trx, command.payload.formulationId, command.payload.organizationId, {
				is_active: false,
				updated_by_profile_id: command.payload.actorProfileId,
			});
		case 'controlOperations.deleteFormulation':
			return softDelete(
				trx,
				'formulations',
				command.payload.formulationId,
				command.payload.organizationId,
				command.payload.actorProfileId,
				formulationReturnColumns,
				toSafeFormulation,
			);
		default:
			throw new Error(`Unsupported formulation command: ${command.type}`);
	}
}

async function updateFormulation(
	trx: ControlOperationsTransaction,
	formulationId: string,
	organizationId: string,
	set: FormulationUpdateColumns,
): Promise<SafeFormulation | null> {
	const row = await trx
		.updateTable('formulations')
		.set({ ...set, updated_at: sql`now()` })
		.where('id', '=', formulationId)
		.where('organization_id', '=', organizationId)
		.where('deleted_at', 'is', null)
		.returning(formulationReturnColumns)
		.executeTakeFirst();
	return row === undefined ? null : toSafeFormulation(row);
}
