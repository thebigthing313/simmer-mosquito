import {
	addAdditionalPersonnelCommand,
	type FieldWorkCommand,
	removeAdditionalPersonnelCommand,
	toDbEntityType,
} from '@simmer-mosquito/domain';
import type { Hono } from 'hono';
import type { AuthVariables } from '../auth-middleware.js';
import {
	additionalPersonnelReturnColumns,
	agencyCommandContext,
	type CommandContext,
	createCommand,
	denyUnauthorizedCommands,
	type FieldWorkDb,
	type FieldWorkTransaction,
	handleCommandError,
	type RouteOptions,
	readJsonObject,
	readTarget,
	readText,
	type SafeAdditionalPersonnel,
	softDelete,
	toSafeAdditionalPersonnel,
	writeCommands,
} from './shared.js';

// ===========================================================================
// Additional personnel
// ===========================================================================

export function registerAdditionalPersonnelRoutes(
	app: Hono<{ Variables: AuthVariables }>,
	options: RouteOptions,
): void {
	app.post('/field-work/additional-personnel', options.authContextMiddleware, async (context) => {
		const raw = await readJsonObject(context.req);
		if (!raw.ok) {
			return context.json({ error: 'invalid_payload', reason: raw.reason }, 400);
		}
		const ctx = agencyCommandContext(context.get('authContext'));
		const result = createCommand(() =>
			addAdditionalPersonnelCommand({
				...ctx,
				additionalPersonnelId: readText(raw.payload.id) ?? '',
				target: readTarget(raw.payload),
				personnelProfileId: readText(raw.payload.personnelProfileId) ?? '',
			}),
		);
		if (!result.ok) {
			return context.json(result.body, 400);
		}
		return runAdditionalPersonnelCommands(context, options.db, [result.command], 201);
	});

	app.delete(
		'/field-work/additional-personnel/:additionalPersonnelId',
		options.authContextMiddleware,
		async (context) => {
			const ctx = agencyCommandContext(context.get('authContext'));
			const result = createCommand(() =>
				removeAdditionalPersonnelCommand({
					...ctx,
					additionalPersonnelId: context.req.param('additionalPersonnelId'),
				}),
			);
			if (!result.ok) {
				return context.json(result.body, 400);
			}
			return runAdditionalPersonnelCommands(context, options.db, [result.command]);
		},
	);
}

async function runAdditionalPersonnelCommands(
	context: CommandContext,
	db: FieldWorkDb,
	commands: readonly FieldWorkCommand[],
	createdStatus?: 201,
) {
	const denial = denyUnauthorizedCommands(context, commands);
	if (denial !== null) {
		return denial;
	}

	try {
		const result = await writeCommands(db, commands, writeAdditionalPersonnelCommand);
		if (result.row === null) {
			return context.json({ error: 'additional_personnel_not_found' }, 404);
		}
		return context.json(
			{ additionalPersonnel: result.row, txid: result.txid },
			createdStatus ?? 200,
		);
	} catch (error) {
		return handleCommandError(context, error);
	}
}

async function writeAdditionalPersonnelCommand(
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
