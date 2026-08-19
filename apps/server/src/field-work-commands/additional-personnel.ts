import {
	addAdditionalPersonnelCommand,
	type FieldWorkCommand,
	removeAdditionalPersonnelCommand,
	toDbEntityType,
} from '@simmer-mosquito/domain';
import type { Hono } from 'hono';
import type { AuthVariables } from '../auth-middleware.js';
import { readText } from '../command-payload.js';
import {
	additionalPersonnelReturnColumns,
	type CommandContext,
	commandEndpoint,
	type FieldWorkDb,
	type FieldWorkTransaction,
	type RouteOptions,
	readTarget,
	runCommands,
	type SafeAdditionalPersonnel,
	softDelete,
	toSafeAdditionalPersonnel,
} from './shared.js';

// ===========================================================================
// Additional personnel
// ===========================================================================

export function registerAdditionalPersonnelRoutes(
	app: Hono<{ Variables: AuthVariables }>,
	options: RouteOptions,
): void {
	app.post(
		'/field-work/additional-personnel',
		options.authContextMiddleware,
		commandEndpoint({
			build: ({ payload, agency: ctx }) =>
				addAdditionalPersonnelCommand({
					...ctx,
					additionalPersonnelId: readText(payload.id) ?? '',
					target: readTarget(payload),
					personnelProfileId: readText(payload.personnelProfileId) ?? '',
				}),
			run: (context, commands) =>
				runAdditionalPersonnelCommands(context, options.db, commands, 201),
		}),
	);

	app.delete(
		'/field-work/additional-personnel/:additionalPersonnelId',
		options.authContextMiddleware,
		commandEndpoint({
			body: 'none',
			build: ({ agency: ctx, param }) =>
				removeAdditionalPersonnelCommand({
					...ctx,
					additionalPersonnelId: param('additionalPersonnelId'),
				}),
			run: (context, commands) => runAdditionalPersonnelCommands(context, options.db, commands),
		}),
	);
}

async function runAdditionalPersonnelCommands(
	context: CommandContext,
	db: FieldWorkDb,
	commands: readonly FieldWorkCommand[],
	createdStatus?: 201,
) {
	return runCommands(
		context,
		{
			db,
			write: writeAdditionalPersonnelCommand,
			notFound: 'additional_personnel_not_found',
			key: 'additionalPersonnel',
		},
		commands,
		createdStatus,
	);
}

export async function writeAdditionalPersonnelCommand(
	trx: FieldWorkTransaction,
	command: FieldWorkCommand,
): Promise<SafeAdditionalPersonnel | null> {
	switch (command.type) {
		case 'fieldWork.addAdditionalPersonnel': {
			const row = await trx
				.insertInto('additional_personnel')
				.values({
					id: command.payload.additionalPersonnelId,
					organization_id: command.payload.organizationId,
					personnel_profile_id: command.payload.personnelProfileId,
					entity_type: toDbEntityType(command.payload.target.type),
					entity_id: command.payload.target.id,
					created_by_profile_id: command.payload.actorProfileId,
					updated_by_profile_id: command.payload.actorProfileId,
				})
				.returning(additionalPersonnelReturnColumns)
				.executeTakeFirstOrThrow();
			return toSafeAdditionalPersonnel(row);
		}
		case 'fieldWork.removeAdditionalPersonnel':
			return softDelete(
				trx,
				'additional_personnel',
				command.payload.additionalPersonnelId,
				command.payload.organizationId,
				command.payload.actorProfileId,
				additionalPersonnelReturnColumns,
				toSafeAdditionalPersonnel,
			);
		default:
			throw new Error(`Unsupported additional personnel command: ${command.type}`);
	}
}
