import { sql } from '@simmer-mosquito/db';
import {
	addFormulationInsecticideCommand,
	type ControlOperationsCommand,
	removeFormulationInsecticideCommand,
	updateFormulationInsecticideCommand,
} from '@simmer-mosquito/domain';
import type { Hono } from 'hono';
import type { AuthVariables } from '../auth-middleware.js';
import { readNumber, readText } from '../command-payload.js';
import {
	type CommandContext,
	type ControlOperationsDb,
	type ControlOperationsTransaction,
	commandEndpoint,
	formulationInsecticideReturnColumns,
	type RouteOptions,
	runCommands,
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
		commandEndpoint({
			build: ({ payload, agency: ctx }) =>
				addFormulationInsecticideCommand({
					...ctx,
					formulationInsecticideId: readText(payload.id) ?? '',
					formulationId: readText(payload.formulationId) ?? '',
					insecticideId: readText(payload.insecticideId) ?? '',
					amount: readNumber(payload.amount) ?? Number.NaN,
					unitId: readText(payload.unitId) ?? '',
				}),
			run: (context, commands) =>
				runFormulationInsecticideCommands(context, options.db, commands, 201),
		}),
	);

	app.patch(
		'/control-operations/formulation-insecticides/:formulationInsecticideId',
		options.authContextMiddleware,
		commandEndpoint({
			build: ({ payload, agency: ctx, param }) =>
				updateFormulationInsecticideCommand({
					...ctx,
					formulationInsecticideId: param('formulationInsecticideId'),
					...('insecticideId' in payload
						? { insecticideId: readText(payload.insecticideId) ?? '' }
						: {}),
					...('amount' in payload ? { amount: readNumber(payload.amount) ?? Number.NaN } : {}),
					...('unitId' in payload ? { unitId: readText(payload.unitId) ?? '' } : {}),
					acknowledgedDeactivateEmptyFormulation: true,
				}),
			run: (context, commands) => runFormulationInsecticideCommands(context, options.db, commands),
		}),
	);

	app.delete(
		'/control-operations/formulation-insecticides/:formulationInsecticideId',
		options.authContextMiddleware,
		commandEndpoint({
			body: 'none',
			build: ({ agency: ctx, param }) =>
				removeFormulationInsecticideCommand({
					...ctx,
					formulationInsecticideId: param('formulationInsecticideId'),
					acknowledgedDeactivateEmptyFormulation: true,
				}),
			run: (context, commands) => runFormulationInsecticideCommands(context, options.db, commands),
		}),
	);
}

async function runFormulationInsecticideCommands(
	context: CommandContext,
	db: ControlOperationsDb,
	commands: readonly ControlOperationsCommand[],
	createdStatus?: 201,
) {
	return runCommands(
		context,
		{
			db,
			write: writeFormulationInsecticideCommand,
			notFound: 'formulation_insecticide_not_found',
			key: 'formulationInsecticide',
		},
		commands,
		createdStatus,
	);
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
