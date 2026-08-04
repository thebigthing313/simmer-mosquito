import {
	addCommentCommand,
	deleteCommentCommand,
	type FieldWorkCommand,
	pinCommentCommand,
	toDbEntityType,
	unpinCommentCommand,
	updateCommentCommand,
} from '@simmer-mosquito/domain';
import type { Hono } from 'hono';
import type { AuthVariables } from '../auth-middleware.js';
import {
	agencyCommandContext,
	type CommandContext,
	commandActor,
	commentReturnColumns,
	createCommand,
	denyUnauthorizedCommands,
	type FieldWorkDb,
	type FieldWorkTransaction,
	handleCommandError,
	invalidUpdate,
	type RouteOptions,
	readDate,
	readJsonObject,
	readTarget,
	readText,
	type SafeComment,
	softDelete,
	toSafeComment,
	updateRow,
	writeCommands,
} from './shared.js';

// ===========================================================================
// Comments
// ===========================================================================

export function registerCommentRoutes(
	app: Hono<{ Variables: AuthVariables }>,
	options: RouteOptions,
): void {
	app.post('/field-work/comments', options.authContextMiddleware, async (context) => {
		const raw = await readJsonObject(context.req);
		if (!raw.ok) {
			return context.json({ error: 'invalid_payload', reason: raw.reason }, 400);
		}
		const ctx = agencyCommandContext(context.get('authContext'));
		const result = createCommand(() =>
			addCommentCommand({
				...ctx,
				commentId: readText(raw.payload.id) ?? '',
				target: readTarget(raw.payload),
				commentText: readText(raw.payload.commentText) ?? '',
				commentedAt: readDate(raw.payload.commentedAt),
			}),
		);
		if (!result.ok) {
			return context.json(result.body, 400);
		}
		return runCommentCommands(context, options.db, [result.command], 201);
	});

	app.patch('/field-work/comments/:commentId', options.authContextMiddleware, async (context) => {
		const raw = await readJsonObject(context.req);
		if (!raw.ok) {
			return context.json({ error: 'invalid_payload', reason: raw.reason }, 400);
		}
		const ctx = agencyCommandContext(context.get('authContext'));
		const commentId = context.req.param('commentId');
		const commands: FieldWorkCommand[] = [];
		if ('commentText' in raw.payload) {
			const result = createCommand(() =>
				updateCommentCommand({
					...ctx,
					commentId,
					commentText: readText(raw.payload.commentText) ?? '',
				}),
			);
			if (!result.ok) {
				return context.json(result.body, 400);
			}
			commands.push(result.command);
		}
		if (typeof raw.payload.isPinned === 'boolean') {
			const result = createCommand(() =>
				raw.payload.isPinned
					? pinCommentCommand({ ...ctx, commentId })
					: unpinCommentCommand({ ...ctx, commentId }),
			);
			if (!result.ok) {
				return context.json(result.body, 400);
			}
			commands.push(result.command);
		}
		if (commands.length === 0) {
			return context.json(invalidUpdate('comment').body, 400);
		}
		return runCommentCommands(context, options.db, commands);
	});

	app.delete('/field-work/comments/:commentId', options.authContextMiddleware, async (context) => {
		const ctx = agencyCommandContext(context.get('authContext'));
		const result = createCommand(() =>
			deleteCommentCommand({ ...ctx, commentId: context.req.param('commentId') }),
		);
		if (!result.ok) {
			return context.json(result.body, 400);
		}
		return runCommentCommands(context, options.db, [result.command]);
	});
}

async function runCommentCommands(
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
		const result = await writeCommands(
			db,
			commandActor(context.get('authContext')),
			commands,
			writeCommentCommand,
		);
		if (result.row === null) {
			return context.json({ error: 'comment_not_found' }, 404);
		}
		return context.json({ comment: result.row, txid: result.txid }, createdStatus ?? 200);
	} catch (error) {
		return handleCommandError(context, error);
	}
}

async function writeCommentCommand(
	trx: FieldWorkTransaction,
	command: FieldWorkCommand,
): Promise<SafeComment | null> {
	switch (command.type) {
		case 'fieldWork.addComment': {
			const row = await trx
				.insertInto('comments')
				.values({
					id: command.payload.commentId,
					organization_id: command.payload.organizationId,
					entity_type: toDbEntityType(command.payload.target.type),
					entity_id: command.payload.target.id,
					comment_text: command.payload.commentText,
					commented_by_profile_id: command.payload.actorProfileId,
					...(command.payload.commentedAt === null
						? {}
						: { commented_at: command.payload.commentedAt }),
					is_pinned: false,
					created_by_profile_id: command.payload.actorProfileId,
					updated_by_profile_id: command.payload.actorProfileId,
				})
				.returning(commentReturnColumns)
				.executeTakeFirstOrThrow();
			return toSafeComment(row);
		}
		case 'fieldWork.updateComment':
			return updateRow(
				trx,
				'comments',
				command.payload.commentId,
				command.payload.organizationId,
				{
					comment_text: command.payload.commentText,
					updated_by_profile_id: command.payload.actorProfileId,
				},
				commentReturnColumns,
				toSafeComment,
			);
		case 'fieldWork.pinComment':
			return updateRow(
				trx,
				'comments',
				command.payload.commentId,
				command.payload.organizationId,
				{
					is_pinned: true,
					updated_by_profile_id: command.payload.actorProfileId,
				},
				commentReturnColumns,
				toSafeComment,
			);
		case 'fieldWork.unpinComment':
			return updateRow(
				trx,
				'comments',
				command.payload.commentId,
				command.payload.organizationId,
				{
					is_pinned: false,
					updated_by_profile_id: command.payload.actorProfileId,
				},
				commentReturnColumns,
				toSafeComment,
			);
		case 'fieldWork.deleteComment':
			return softDelete(
				trx,
				'comments',
				command.payload.commentId,
				command.payload.organizationId,
				command.payload.actorProfileId,
				commentReturnColumns,
				toSafeComment,
			);
		default:
			throw new Error(`Unsupported comment command: ${command.type}`);
	}
}
