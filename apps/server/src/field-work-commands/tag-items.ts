import {
	assignTagCommand,
	type FieldWorkCommand,
	type TagTarget,
	toDbEntityType,
	unassignTagCommand,
} from '@simmer-mosquito/domain';
import type { Hono } from 'hono';
import type { AuthVariables } from '../auth-middleware.js';
import {
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
	type SafeTagItem,
	softDelete,
	tagItemReturnColumns,
	toSafeTagItem,
	writeCommands,
} from './shared.js';

// ===========================================================================
// Tag items
// ===========================================================================

export function registerTagItemRoutes(
	app: Hono<{ Variables: AuthVariables }>,
	options: RouteOptions,
): void {
	app.post('/field-work/tag-items', options.authContextMiddleware, async (context) => {
		const raw = await readJsonObject(context.req);
		if (!raw.ok) {
			return context.json({ error: 'invalid_payload', reason: raw.reason }, 400);
		}
		const ctx = agencyCommandContext(context.get('authContext'));
		const result = createCommand(() =>
			assignTagCommand({
				...ctx,
				tagItemId: readText(raw.payload.id) ?? '',
				tagId: readText(raw.payload.tagId) ?? '',
				target: readTarget(raw.payload) as TagTarget,
			}),
		);
		if (!result.ok) {
			return context.json(result.body, 400);
		}
		return runTagItemCommands(context, options.db, [result.command], 201);
	});

	app.delete('/field-work/tag-items/:tagItemId', options.authContextMiddleware, async (context) => {
		const ctx = agencyCommandContext(context.get('authContext'));
		const result = createCommand(() =>
			unassignTagCommand({ ...ctx, tagItemId: context.req.param('tagItemId') }),
		);
		if (!result.ok) {
			return context.json(result.body, 400);
		}
		return runTagItemCommands(context, options.db, [result.command]);
	});
}

async function runTagItemCommands(
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
		const result = await writeCommands(db, commands, writeTagItemCommand);
		if (result.row === null) {
			return context.json({ error: 'tag_item_not_found' }, 404);
		}
		return context.json({ tagItem: result.row, txid: result.txid }, createdStatus ?? 200);
	} catch (error) {
		return handleCommandError(context, error);
	}
}

async function writeTagItemCommand(
	trx: FieldWorkTransaction,
	command: FieldWorkCommand,
): Promise<SafeTagItem | null> {
	switch (command.type) {
		case 'fieldWork.assignTag': {
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
			return toSafeTagItem(row);
		}
		case 'fieldWork.unassignTag':
			return softDelete(
				trx,
				'tag_items',
				command.payload.tagItemId,
				command.payload.organizationId,
				command.payload.actorProfileId,
				tagItemReturnColumns,
				toSafeTagItem,
			);
		default:
			throw new Error(`Unsupported tag item command: ${command.type}`);
	}
}
