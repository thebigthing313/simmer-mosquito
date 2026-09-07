import { checkedValues } from '@simmer-mosquito/db';
import { type FieldWorkCommand, toDbEntityType } from '@simmer-mosquito/domain';
import {
	type CommentRow,
	commentReturnColumns,
	type FieldWorkTransaction,
	softDelete,
	updateRow,
} from './shared.js';

// ===========================================================================
// Comments
// ===========================================================================

export async function writeCommentCommand(
	trx: FieldWorkTransaction,
	command: FieldWorkCommand,
): Promise<CommentRow | null> {
	switch (command.type) {
		case 'fieldWork.addComment': {
			const row = await trx
				.insertInto('comments')
				.values(
					await checkedValues(trx, command.payload.organizationId, {
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
					}),
				)
				.returning(commentReturnColumns)
				.executeTakeFirstOrThrow();
			return row;
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
			);
		case 'fieldWork.deleteComment':
			return softDelete(
				trx,
				'comments',
				command.payload.commentId,
				command.payload.organizationId,
				command.payload.actorProfileId,
				commentReturnColumns,
			);
		default:
			throw new Error(`Unsupported comment command: ${command.type}`);
	}
}
