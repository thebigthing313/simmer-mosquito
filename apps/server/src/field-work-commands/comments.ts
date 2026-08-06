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
import { readText } from '../command-payload.js';
import {
	type CommandContext,
	commandActor,
	commandEndpoint,
	commentReturnColumns,
	denyUnauthorizedCommands,
	type FieldWorkDb,
	type FieldWorkTransaction,
	handleCommandError,
	invalidUpdate,
	type RouteOptions,
	readDate,
	readTarget,
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
	app.post(
		'/field-work/comments',
		options.authContextMiddleware,
		commandEndpoint({
			build: ({ payload, agency: ctx }) =>
				addCommentCommand({
					...ctx,
					commentId: readText(payload.id) ?? '',
					target: readTarget(payload),
					commentText: readText(payload.commentText) ?? '',
					commentedAt: readDate(payload.commentedAt),
				}),
			run: (context, commands) => runCommentCommands(context, options.db, commands, 201),
		}),
	);

	app.patch(
		'/field-work/comments/:commentId',
		options.authContextMiddleware,
		commandEndpoint({
			build: ({ payload, agency: ctx, param }) => {
				const commentId = param('commentId');
				const commands: FieldWorkCommand[] = [];
				if ('commentText' in payload) {
					commands.push(
						updateCommentCommand({
							...ctx,
							commentId,
							commentText: readText(payload.commentText) ?? '',
						}),
					);
				}
				if (typeof payload.isPinned === 'boolean') {
					commands.push(
						payload.isPinned
							? pinCommentCommand({ ...ctx, commentId })
							: unpinCommentCommand({ ...ctx, commentId }),
					);
				}
				return commands.length === 0 ? invalidUpdate('comment') : { ok: true, commands };
			},
			run: (context, commands) => runCommentCommands(context, options.db, commands),
		}),
	);

	app.delete(
		'/field-work/comments/:commentId',
		options.authContextMiddleware,
		commandEndpoint({
			body: 'none',
			build: ({ agency: ctx, param }) =>
				deleteCommentCommand({ ...ctx, commentId: param('commentId') }),
			run: (context, commands) => runCommentCommands(context, options.db, commands),
		}),
	);
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
