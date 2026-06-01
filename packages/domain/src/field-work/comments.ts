import {
	createIssues,
	requiredId as normalizeRequiredId,
	requiredText as normalizeRequiredText,
	requiredUuid as requireUuid,
	throwIfIssues,
} from '../command-validation.js';
import type { DomainId } from '../shared.js';
import {
	basePayload,
	COMMENT_TARGET_TYPES,
	type CommentTarget,
	type FieldWorkCommandInput,
	type FieldWorkCommandPayload,
	type FieldWorkDomainCommand,
	normalizeOptionalTimestamp,
	validateBase,
	validateIdCommand,
	validateTarget,
} from './shared.js';

export interface AddCommentCommandInput extends FieldWorkCommandInput {
	readonly commentId: DomainId;
	readonly target: CommentTarget;
	readonly commentText: string;
	readonly commentedAt?: Date | null;
}

export type AddCommentCommand = FieldWorkDomainCommand<
	'fieldWork.addComment',
	FieldWorkCommandPayload & {
		readonly commentId: DomainId;
		readonly target: CommentTarget;
		readonly commentText: string;
		readonly commentedAt: Date | null;
	}
>;

export interface UpdateCommentCommandInput extends FieldWorkCommandInput {
	readonly commentId: DomainId;
	readonly commentText: string;
}

export type UpdateCommentCommand = FieldWorkDomainCommand<
	'fieldWork.updateComment',
	FieldWorkCommandPayload & {
		readonly commentId: DomainId;
		readonly commentText: string;
	}
>;

export interface CommentIdCommandInput extends FieldWorkCommandInput {
	readonly commentId: DomainId;
}

export type DeleteCommentCommand = FieldWorkDomainCommand<
	'fieldWork.deleteComment',
	FieldWorkCommandPayload & { readonly commentId: DomainId }
>;

export type PinCommentCommand = FieldWorkDomainCommand<
	'fieldWork.pinComment',
	FieldWorkCommandPayload & { readonly commentId: DomainId }
>;

export type UnpinCommentCommand = FieldWorkDomainCommand<
	'fieldWork.unpinComment',
	FieldWorkCommandPayload & { readonly commentId: DomainId }
>;

export function addCommentCommand(input: AddCommentCommandInput): AddCommentCommand {
	const issues = createIssues();
	validateBase(input, issues);
	requireUuid(input.commentId, 'commentId', issues);
	const target = validateTarget(input.target, COMMENT_TARGET_TYPES, 'target', issues, requireUuid);
	const commentText = normalizeRequiredText(input.commentText, 'commentText', issues, 10_000);
	const commentedAt = normalizeOptionalTimestamp(input.commentedAt, 'commentedAt', issues, false);
	throwIfIssues('Add comment command is invalid.', issues);

	return {
		type: 'fieldWork.addComment',
		payload: {
			...basePayload(input),
			commentId: normalizeRequiredId(input.commentId),
			target,
			commentText,
			commentedAt,
		},
	};
}

export function updateCommentCommand(input: UpdateCommentCommandInput): UpdateCommentCommand {
	const issues = validateIdCommand(input, 'commentId', requireUuid);
	const commentText = normalizeRequiredText(input.commentText, 'commentText', issues, 10_000);
	throwIfIssues('Update comment command is invalid.', issues);

	return {
		type: 'fieldWork.updateComment',
		payload: {
			...basePayload(input),
			commentId: normalizeRequiredId(input.commentId),
			commentText,
		},
	};
}

export function deleteCommentCommand(input: CommentIdCommandInput): DeleteCommentCommand {
	const issues = validateIdCommand(input, 'commentId', requireUuid);
	throwIfIssues('Delete comment command is invalid.', issues);
	return {
		type: 'fieldWork.deleteComment',
		payload: { ...basePayload(input), commentId: normalizeRequiredId(input.commentId) },
	};
}

export function pinCommentCommand(input: CommentIdCommandInput): PinCommentCommand {
	const issues = validateIdCommand(input, 'commentId', requireUuid);
	throwIfIssues('Pin comment command is invalid.', issues);
	return {
		type: 'fieldWork.pinComment',
		payload: { ...basePayload(input), commentId: normalizeRequiredId(input.commentId) },
	};
}

export function unpinCommentCommand(input: CommentIdCommandInput): UnpinCommentCommand {
	const issues = validateIdCommand(input, 'commentId', requireUuid);
	throwIfIssues('Unpin comment command is invalid.', issues);
	return {
		type: 'fieldWork.unpinComment',
		payload: { ...basePayload(input), commentId: normalizeRequiredId(input.commentId) },
	};
}
