import { type MutationWriteResult, sql } from '@simmer-mosquito/db';
import {
	addFormulationInsecticideCommand,
	type ControlOperationsCommand,
	removeFormulationInsecticideCommand,
	updateFormulationInsecticideCommand,
} from '@simmer-mosquito/domain';
import type { Hono } from 'hono';
import type { AuthVariables } from '../auth-middleware.js';
import {
	agencyCommandContext,
	type CommandContext,
	type ControlOperationsDb,
	type ControlOperationsTransaction,
	createCommand,
	formulationInsecticideReturnColumns,
	handleCommandError,
	type RouteOptions,
	readCurrentTransactionId,
	readJsonObject,
	readNumber,
	readText,
	type SafeFormulationInsecticide,
	softDelete,
	toSafeFormulationInsecticide,
} from './shared.js';

// ===========================================================================
// Formulation insecticides
// ===========================================================================

export function registerFormulationInsecticideRoutes(
	app: Hono<{ Variables: AuthVariables }>,
	options: RouteOptions,
): void {
	app.post(
		'/control-operations/formulation-insecticides',
		options.authContextMiddleware,
		async (context) => {
			const raw = await readJsonObject(context.req);
			if (!raw.ok) {
				return context.json({ error: 'invalid_payload', reason: raw.reason }, 400);
			}
			const ctx = agencyCommandContext(context.get('authContext'));
			const result = createCommand(() =>
				addFormulationInsecticideCommand({
					...ctx,
					formulationInsecticideId: readText(raw.payload.id) ?? '',
					formulationId: readText(raw.payload.formulationId) ?? '',
					insecticideId: readText(raw.payload.insecticideId) ?? '',
					amount: readNumber(raw.payload.amount) ?? Number.NaN,
					unitId: readText(raw.payload.unitId) ?? '',
				}),
			);
			if (!result.ok) {
				return context.json(result.body, 400);
			}
			return runFormulationInsecticideCommands(context, options.db, [result.command], 201);
		},
	);

	app.patch(
		'/control-operations/formulation-insecticides/:formulationInsecticideId',
		options.authContextMiddleware,
		async (context) => {
			const raw = await readJsonObject(context.req);
			if (!raw.ok) {
				return context.json({ error: 'invalid_payload', reason: raw.reason }, 400);
			}
			const ctx = agencyCommandContext(context.get('authContext'));
			const payload = raw.payload;
			const result = createCommand(() =>
				updateFormulationInsecticideCommand({
					...ctx,
					formulationInsecticideId: context.req.param('formulationInsecticideId'),
					...('insecticideId' in payload
						? { insecticideId: readText(payload.insecticideId) ?? '' }
						: {}),
					...('amount' in payload ? { amount: readNumber(payload.amount) ?? Number.NaN } : {}),
					...('unitId' in payload ? { unitId: readText(payload.unitId) ?? '' } : {}),
					acknowledgedDeactivateEmptyFormulation: true,
				}),
			);
			if (!result.ok) {
				return context.json(result.body, 400);
			}
			return runFormulationInsecticideCommands(context, options.db, [result.command]);
		},
	);

	app.delete(
		'/control-operations/formulation-insecticides/:formulationInsecticideId',
		options.authContextMiddleware,
		async (context) => {
			const ctx = agencyCommandContext(context.get('authContext'));
			const result = createCommand(() =>
				removeFormulationInsecticideCommand({
					...ctx,
					formulationInsecticideId: context.req.param('formulationInsecticideId'),
					acknowledgedDeactivateEmptyFormulation: true,
				}),
			);
			if (!result.ok) {
				return context.json(result.body, 400);
			}
			return runFormulationInsecticideCommands(context, options.db, [result.command]);
		},
	);
}

async function runFormulationInsecticideCommands(
	context: CommandContext,
	db: ControlOperationsDb,
	commands: readonly ControlOperationsCommand[],
	createdStatus?: 201,
) {
	try {
		const result = await writeFormulationInsecticideCommands(db, commands);
		if (result.row === null) {
			return context.json({ error: 'formulation_insecticide_not_found' }, 404);
		}
		return context.json(
			{ formulationInsecticide: result.row, txid: result.txid },
			createdStatus ?? 200,
		);
	} catch (error) {
		return handleCommandError(context, error);
	}
}

async function writeFormulationInsecticideCommands(
	db: ControlOperationsDb,
	commands: readonly ControlOperationsCommand[],
): Promise<MutationWriteResult<SafeFormulationInsecticide | null>> {
	return db.transaction().execute(async (trx) => {
		let row: SafeFormulationInsecticide | null = null;
		for (const command of commands) {
			row = await writeFormulationInsecticideCommand(trx, command);
		}
		return { row, txid: await readCurrentTransactionId(trx) };
	});
}

async function writeFormulationInsecticideCommand(
	trx: ControlOperationsTransaction,
	command: ControlOperationsCommand,
): Promise<SafeFormulationInsecticide | null> {
	switch (command.type) {
		case 'controlOperations.addFormulationInsecticide': {
			const row = await trx
				.insertInto('formulation_insecticides')
				.values({
					id: command.payload.formulationInsecticideId,
					organization_id: command.payload.organizationId,
					formulation_id: command.payload.formulationId,
					insecticide_id: command.payload.insecticideId,
					amount: command.payload.amount,
					unit_id: command.payload.unitId,
					created_by_profile_id: command.payload.actorProfileId,
					updated_by_profile_id: command.payload.actorProfileId,
				})
				.returning(formulationInsecticideReturnColumns)
				.executeTakeFirstOrThrow();
			return toSafeFormulationInsecticide(row);
		}
		case 'controlOperations.updateFormulationInsecticide': {
			const row = await trx
				.updateTable('formulation_insecticides')
				.set({
					...('insecticideId' in command.payload.changes
						? { insecticide_id: command.payload.changes.insecticideId }
						: {}),
					...('amount' in command.payload.changes
						? { amount: command.payload.changes.amount }
						: {}),
					...('unitId' in command.payload.changes
						? { unit_id: command.payload.changes.unitId }
						: {}),
					updated_by_profile_id: command.payload.actorProfileId,
					updated_at: sql`now()`,
				})
				.where('id', '=', command.payload.formulationInsecticideId)
				.where('organization_id', '=', command.payload.organizationId)
				.where('deleted_at', 'is', null)
				.returning(formulationInsecticideReturnColumns)
				.executeTakeFirst();
			return row === undefined ? null : toSafeFormulationInsecticide(row);
		}
		case 'controlOperations.removeFormulationInsecticide':
			return softDelete(
				trx,
				'formulation_insecticides',
				command.payload.formulationInsecticideId,
				command.payload.organizationId,
				command.payload.actorProfileId,
				formulationInsecticideReturnColumns,
				toSafeFormulationInsecticide,
			);
		default:
			throw new Error(`Unsupported formulation insecticide command: ${command.type}`);
	}
}
