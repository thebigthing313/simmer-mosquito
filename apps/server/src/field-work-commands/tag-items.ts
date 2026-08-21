import { assertCatalogReferences } from '@simmer-mosquito/db';
import {
	assignTagCommand,
	type FieldWorkCommand,
	type TagTarget,
	toDbEntityType,
	unassignTagCommand,
} from '@simmer-mosquito/domain';
import type { Hono } from 'hono';
import type { AuthVariables } from '../auth-middleware.js';
import { readText } from '../command-payload.js';
import {
	type CommandContext,
	commandEndpoint,
	type FieldWorkDb,
	type FieldWorkTransaction,
	type RouteOptions,
	readTarget,
	runCommands,
	softDelete,
	type TagItemRow,
	tagItemReturnColumns,
} from './shared.js';

// ===========================================================================
// Tag items
// ===========================================================================

export function registerTagItemRoutes(
	app: Hono<{ Variables: AuthVariables }>,
	options: RouteOptions,
): void {
	app.post(
		'/field-work/tag-items',
		options.authContextMiddleware,
		commandEndpoint({
			build: ({ payload, agency: ctx }) =>
				assignTagCommand({
					...ctx,
					tagItemId: readText(payload.id) ?? '',
					tagId: readText(payload.tagId) ?? '',
					target: readTarget(payload) as TagTarget,
				}),
			run: (context, commands) => runTagItemCommands(context, options.db, commands, 201),
		}),
	);

	app.delete(
		'/field-work/tag-items/:tagItemId',
		options.authContextMiddleware,
		commandEndpoint({
			body: 'none',
			build: ({ agency: ctx, param }) =>
				unassignTagCommand({ ...ctx, tagItemId: param('tagItemId') }),
			run: (context, commands) => runTagItemCommands(context, options.db, commands),
		}),
	);
}

async function runTagItemCommands(
	context: CommandContext,
	db: FieldWorkDb,
	commands: readonly FieldWorkCommand[],
	createdStatus?: 201,
) {
	return runCommands(
		context,
		{ db, write: writeTagItemCommand, notFound: 'tag_item_not_found', key: 'tagItem' },
		commands,
		createdStatus,
	);
}

export async function writeTagItemCommand(
	trx: FieldWorkTransaction,
	command: FieldWorkCommand,
): Promise<TagItemRow | null> {
	switch (command.type) {
		case 'fieldWork.assignTag': {
			await assertCatalogReferences(trx, {
				organizationId: command.payload.organizationId,
				references: [{ column: 'tag_id', catalog: 'tag', id: command.payload.tagId, label: 'tag' }],
			});
			const row = await trx
				.insertInto('tag_items')
				.values({
					id: command.payload.tagItemId,
					organization_id: command.payload.organizationId,
					tag_id: command.payload.tagId,
					entity_type: toDbEntityType(command.payload.target.type),
					entity_id: command.payload.target.id,
					created_by_profile_id: command.payload.actorProfileId,
					updated_by_profile_id: command.payload.actorProfileId,
				})
				.returning(tagItemReturnColumns)
				.executeTakeFirstOrThrow();
			return row;
		}
		case 'fieldWork.unassignTag':
			return softDelete(
				trx,
				'tag_items',
				command.payload.tagItemId,
				command.payload.organizationId,
				command.payload.actorProfileId,
				tagItemReturnColumns,
			);
		default:
			throw new Error(`Unsupported tag item command: ${command.type}`);
	}
}
