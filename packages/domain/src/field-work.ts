import {
	type DomainId,
	DomainValidationError,
	type DomainValidationIssue,
	type LocalDateString,
} from './shared.js';

export type CommentTargetType =
	| 'address'
	| 'region'
	| 'trap'
	| 'collection'
	| 'habitat'
	| 'inspection'
	| 'sample'
	| 'application'
	| 'sourceReduction'
	| 'outreachAction'
	| 'biocontrolAction'
	| 'contact'
	| 'serviceRequest'
	| 'route'
	| 'assignment'
	| 'requestedControlAction'
	| 'mission';

export type TagTargetType =
	| 'address'
	| 'region'
	| 'trap'
	| 'habitat'
	| 'contact'
	| 'serviceRequest';

export type AdditionalPersonnelTargetType =
	| 'inspection'
	| 'collection'
	| 'application'
	| 'sourceReduction'
	| 'outreachAction'
	| 'biocontrolAction';

export type RouteItemTargetType = 'trap' | 'habitat';
export type RouteType = RouteItemTargetType;
export type AssignmentItemTargetType = 'trap' | 'habitat' | 'serviceRequest';

export type FieldWorkCommandType =
	| 'fieldWork.addComment'
	| 'fieldWork.updateComment'
	| 'fieldWork.deleteComment'
	| 'fieldWork.pinComment'
	| 'fieldWork.unpinComment'
	| 'fieldWork.createTag'
	| 'fieldWork.updateTag'
	| 'fieldWork.activateTag'
	| 'fieldWork.deactivateTag'
	| 'fieldWork.deleteTag'
	| 'fieldWork.assignTag'
	| 'fieldWork.unassignTag'
	| 'fieldWork.addAdditionalPersonnel'
	| 'fieldWork.removeAdditionalPersonnel'
	| 'fieldWork.createRoute'
	| 'fieldWork.updateRouteDetails'
	| 'fieldWork.deleteRoute'
	| 'fieldWork.addRouteItem'
	| 'fieldWork.updateRouteItem'
	| 'fieldWork.removeRouteItem'
	| 'fieldWork.moveRouteItems'
	| 'fieldWork.createAssignment'
	| 'fieldWork.createAssignmentFromRoute'
	| 'fieldWork.selfAssignRoute'
	| 'fieldWork.updateAssignmentDetails'
	| 'fieldWork.addAssignmentItem'
	| 'fieldWork.updateAssignmentItem'
	| 'fieldWork.removeAssignmentItem'
	| 'fieldWork.moveAssignmentItems'
	| 'fieldWork.startAssignment'
	| 'fieldWork.completeAssignment'
	| 'fieldWork.cancelAssignment'
	| 'fieldWork.reopenAssignment'
	| 'fieldWork.deleteAssignment'
	| 'fieldWork.completeAssignmentItem'
	| 'fieldWork.reopenAssignmentItem'
	| 'fieldWork.skipAssignmentItem'
	| 'fieldWork.unskipAssignmentItem';

export interface FieldWorkDomainCommand<TType extends FieldWorkCommandType, TPayload> {
	readonly type: TType;
	readonly payload: TPayload;
}

interface FieldWorkCommandInput {
	readonly organizationId: DomainId;
	readonly actorProfileId: DomainId;
}

interface FieldWorkCommandPayload {
	readonly organizationId: DomainId;
	readonly actorProfileId: DomainId;
}

export interface EntityTarget<TType extends string> {
	readonly type: TType;
	readonly id: DomainId;
}

export type CommentTarget = EntityTarget<CommentTargetType>;
export type TagTarget = EntityTarget<TagTargetType>;
export type AdditionalPersonnelTarget = EntityTarget<AdditionalPersonnelTargetType>;
export type RouteItemTarget = EntityTarget<RouteItemTargetType>;
export type AssignmentItemTarget = EntityTarget<AssignmentItemTargetType>;

export type RouteItemPlacement =
	| { readonly kind: 'start' }
	| { readonly kind: 'end' }
	| { readonly kind: 'before'; readonly routeItemId: DomainId }
	| { readonly kind: 'after'; readonly routeItemId: DomainId };

export type AssignmentItemPlacement =
	| { readonly kind: 'start' }
	| { readonly kind: 'end' }
	| { readonly kind: 'before'; readonly assignmentItemId: DomainId }
	| { readonly kind: 'after'; readonly assignmentItemId: DomainId };

export interface RouteAssignmentItemIdMapping {
	readonly routeItemId: DomainId;
	readonly assignmentItemId: DomainId;
}

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

export interface CreateTagCommandInput extends FieldWorkCommandInput {
	readonly tagId: DomainId;
	readonly tagName: string;
	readonly description?: string | null;
	readonly color?: string | null;
}

export type CreateTagCommand = FieldWorkDomainCommand<
	'fieldWork.createTag',
	FieldWorkCommandPayload & {
		readonly tagId: DomainId;
		readonly tagName: string;
		readonly description: string | null;
		readonly color: string | null;
	}
>;

export interface UpdateTagCommandInput extends FieldWorkCommandInput {
	readonly tagId: DomainId;
	readonly tagName?: string;
	readonly description?: string | null;
	readonly color?: string | null;
}

export type UpdateTagCommand = FieldWorkDomainCommand<
	'fieldWork.updateTag',
	FieldWorkCommandPayload & {
		readonly tagId: DomainId;
		readonly changes: Readonly<{
			readonly tagName?: string;
			readonly description?: string | null;
			readonly color?: string | null;
		}>;
	}
>;

export interface TagIdCommandInput extends FieldWorkCommandInput {
	readonly tagId: DomainId;
}

export type ActivateTagCommand = FieldWorkDomainCommand<
	'fieldWork.activateTag',
	FieldWorkCommandPayload & { readonly tagId: DomainId }
>;

export type DeactivateTagCommand = FieldWorkDomainCommand<
	'fieldWork.deactivateTag',
	FieldWorkCommandPayload & { readonly tagId: DomainId }
>;

export type DeleteTagCommand = FieldWorkDomainCommand<
	'fieldWork.deleteTag',
	FieldWorkCommandPayload & { readonly tagId: DomainId }
>;

export interface AssignTagCommandInput extends FieldWorkCommandInput {
	readonly tagItemId: DomainId;
	readonly tagId: DomainId;
	readonly target: TagTarget;
}

export type AssignTagCommand = FieldWorkDomainCommand<
	'fieldWork.assignTag',
	FieldWorkCommandPayload & {
		readonly tagItemId: DomainId;
		readonly tagId: DomainId;
		readonly target: TagTarget;
	}
>;

export interface UnassignTagCommandInput extends FieldWorkCommandInput {
	readonly tagItemId: DomainId;
}

export type UnassignTagCommand = FieldWorkDomainCommand<
	'fieldWork.unassignTag',
	FieldWorkCommandPayload & { readonly tagItemId: DomainId }
>;

export interface AddAdditionalPersonnelCommandInput extends FieldWorkCommandInput {
	readonly additionalPersonnelId: DomainId;
	readonly target: AdditionalPersonnelTarget;
	readonly personnelProfileId: DomainId;
}

export type AddAdditionalPersonnelCommand = FieldWorkDomainCommand<
	'fieldWork.addAdditionalPersonnel',
	FieldWorkCommandPayload & {
		readonly additionalPersonnelId: DomainId;
		readonly target: AdditionalPersonnelTarget;
		readonly personnelProfileId: DomainId;
	}
>;

export interface RemoveAdditionalPersonnelCommandInput extends FieldWorkCommandInput {
	readonly additionalPersonnelId: DomainId;
}

export type RemoveAdditionalPersonnelCommand = FieldWorkDomainCommand<
	'fieldWork.removeAdditionalPersonnel',
	FieldWorkCommandPayload & { readonly additionalPersonnelId: DomainId }
>;

export interface CreateRouteCommandInput extends FieldWorkCommandInput {
	readonly routeId: DomainId;
	readonly routeName: string;
	readonly routeType: RouteType;
}

export type CreateRouteCommand = FieldWorkDomainCommand<
	'fieldWork.createRoute',
	FieldWorkCommandPayload & {
		readonly routeId: DomainId;
		readonly routeName: string;
		readonly routeType: RouteType;
	}
>;

export interface UpdateRouteDetailsCommandInput extends FieldWorkCommandInput {
	readonly routeId: DomainId;
	readonly routeName?: string;
}

export type UpdateRouteDetailsCommand = FieldWorkDomainCommand<
	'fieldWork.updateRouteDetails',
	FieldWorkCommandPayload & {
		readonly routeId: DomainId;
		readonly changes: Readonly<{ readonly routeName?: string }>;
	}
>;

export interface DeleteRouteCommandInput extends FieldWorkCommandInput {
	readonly routeId: DomainId;
	readonly acknowledgedRouteItemDeletion?: boolean;
}

export type DeleteRouteCommand = FieldWorkDomainCommand<
	'fieldWork.deleteRoute',
	FieldWorkCommandPayload & {
		readonly routeId: DomainId;
		readonly acknowledgedRouteItemDeletion: boolean;
	}
>;

export interface AddRouteItemCommandInput extends FieldWorkCommandInput {
	readonly routeItemId: DomainId;
	readonly routeId: DomainId;
	readonly target: RouteItemTarget;
	readonly placement?: RouteItemPlacement;
	readonly directionsToNextItem?: string | null;
}

export type AddRouteItemCommand = FieldWorkDomainCommand<
	'fieldWork.addRouteItem',
	FieldWorkCommandPayload & {
		readonly routeItemId: DomainId;
		readonly routeId: DomainId;
		readonly target: RouteItemTarget;
		readonly placement: RouteItemPlacement;
		readonly directionsToNextItem: string | null;
	}
>;

export interface UpdateRouteItemCommandInput extends FieldWorkCommandInput {
	readonly routeItemId: DomainId;
	readonly directionsToNextItem?: string | null;
}

export type UpdateRouteItemCommand = FieldWorkDomainCommand<
	'fieldWork.updateRouteItem',
	FieldWorkCommandPayload & {
		readonly routeItemId: DomainId;
		readonly changes: Readonly<{ readonly directionsToNextItem?: string | null }>;
	}
>;

export interface RouteItemIdCommandInput extends FieldWorkCommandInput {
	readonly routeItemId: DomainId;
}

export type RemoveRouteItemCommand = FieldWorkDomainCommand<
	'fieldWork.removeRouteItem',
	FieldWorkCommandPayload & { readonly routeItemId: DomainId }
>;

export interface MoveRouteItemsCommandInput extends FieldWorkCommandInput {
	readonly routeId: DomainId;
	readonly routeItemIds: readonly DomainId[];
	readonly placement: RouteItemPlacement;
}

export type MoveRouteItemsCommand = FieldWorkDomainCommand<
	'fieldWork.moveRouteItems',
	FieldWorkCommandPayload & {
		readonly routeId: DomainId;
		readonly routeItemIds: readonly DomainId[];
		readonly placement: RouteItemPlacement;
	}
>;

export interface CreateAssignmentCommandInput extends FieldWorkCommandInput {
	readonly assignmentId: DomainId;
	readonly assignmentDate: LocalDateString;
	readonly assignmentName?: string | null;
	readonly assignedToProfileId?: DomainId | null;
	readonly dueAt?: Date | null;
}

export type CreateAssignmentCommand = FieldWorkDomainCommand<
	'fieldWork.createAssignment',
	FieldWorkCommandPayload & {
		readonly assignmentId: DomainId;
		readonly assignmentDate: LocalDateString;
		readonly assignmentName: string | null;
		readonly assignedToProfileId: DomainId | null;
		readonly dueAt: Date | null;
	}
>;

export interface CreateAssignmentFromRouteCommandInput extends FieldWorkCommandInput {
	readonly assignmentId: DomainId;
	readonly routeId: DomainId;
	readonly assignmentDate: LocalDateString;
	readonly assignmentItemIds: readonly RouteAssignmentItemIdMapping[];
	readonly assignmentName?: string | null;
	readonly assignedToProfileId?: DomainId | null;
	readonly dueAt?: Date | null;
}

export type CreateAssignmentFromRouteCommand = FieldWorkDomainCommand<
	'fieldWork.createAssignmentFromRoute',
	CreateAssignmentCommand['payload'] & {
		readonly routeId: DomainId;
		readonly assignmentItemIds: readonly RouteAssignmentItemIdMapping[];
	}
>;

export interface SelfAssignRouteCommandInput extends FieldWorkCommandInput {
	readonly assignmentId: DomainId;
	readonly routeId: DomainId;
	readonly assignmentItemIds: readonly RouteAssignmentItemIdMapping[];
}

export type SelfAssignRouteCommand = FieldWorkDomainCommand<
	'fieldWork.selfAssignRoute',
	FieldWorkCommandPayload & {
		readonly assignmentId: DomainId;
		readonly routeId: DomainId;
		readonly assignmentItemIds: readonly RouteAssignmentItemIdMapping[];
	}
>;

export interface UpdateAssignmentDetailsCommandInput extends FieldWorkCommandInput {
	readonly assignmentId: DomainId;
	readonly assignmentDate?: LocalDateString;
	readonly assignmentName?: string | null;
	readonly assignedToProfileId?: DomainId | null;
	readonly dueAt?: Date | null;
}

export type UpdateAssignmentDetailsCommand = FieldWorkDomainCommand<
	'fieldWork.updateAssignmentDetails',
	FieldWorkCommandPayload & {
		readonly assignmentId: DomainId;
		readonly changes: Readonly<{
			readonly assignmentDate?: LocalDateString;
			readonly assignmentName?: string | null;
			readonly assignedToProfileId?: DomainId | null;
			readonly dueAt?: Date | null;
		}>;
	}
>;

export interface AddAssignmentItemCommandInput extends FieldWorkCommandInput {
	readonly assignmentItemId: DomainId;
	readonly assignmentId: DomainId;
	readonly target: AssignmentItemTarget;
	readonly placement?: AssignmentItemPlacement;
	readonly directionsToNextItem?: string | null;
}

export type AddAssignmentItemCommand = FieldWorkDomainCommand<
	'fieldWork.addAssignmentItem',
	FieldWorkCommandPayload & {
		readonly assignmentItemId: DomainId;
		readonly assignmentId: DomainId;
		readonly target: AssignmentItemTarget;
		readonly placement: AssignmentItemPlacement;
		readonly directionsToNextItem: string | null;
	}
>;

export interface UpdateAssignmentItemCommandInput extends FieldWorkCommandInput {
	readonly assignmentItemId: DomainId;
	readonly directionsToNextItem?: string | null;
}

export type UpdateAssignmentItemCommand = FieldWorkDomainCommand<
	'fieldWork.updateAssignmentItem',
	FieldWorkCommandPayload & {
		readonly assignmentItemId: DomainId;
		readonly changes: Readonly<{ readonly directionsToNextItem?: string | null }>;
	}
>;

export interface AssignmentItemIdCommandInput extends FieldWorkCommandInput {
	readonly assignmentItemId: DomainId;
}

export type RemoveAssignmentItemCommand = FieldWorkDomainCommand<
	'fieldWork.removeAssignmentItem',
	FieldWorkCommandPayload & { readonly assignmentItemId: DomainId }
>;

export interface MoveAssignmentItemsCommandInput extends FieldWorkCommandInput {
	readonly assignmentId: DomainId;
	readonly assignmentItemIds: readonly DomainId[];
	readonly placement: AssignmentItemPlacement;
}

export type MoveAssignmentItemsCommand = FieldWorkDomainCommand<
	'fieldWork.moveAssignmentItems',
	FieldWorkCommandPayload & {
		readonly assignmentId: DomainId;
		readonly assignmentItemIds: readonly DomainId[];
		readonly placement: AssignmentItemPlacement;
	}
>;

export interface AssignmentIdCommandInput extends FieldWorkCommandInput {
	readonly assignmentId: DomainId;
}

export interface StartAssignmentCommandInput extends AssignmentIdCommandInput {
	readonly startedAt?: Date | null;
}

export type StartAssignmentCommand = FieldWorkDomainCommand<
	'fieldWork.startAssignment',
	FieldWorkCommandPayload & { readonly assignmentId: DomainId; readonly startedAt: Date | null }
>;

export interface CompleteAssignmentCommandInput extends AssignmentIdCommandInput {
	readonly completedAt?: Date | null;
}

export type CompleteAssignmentCommand = FieldWorkDomainCommand<
	'fieldWork.completeAssignment',
	FieldWorkCommandPayload & { readonly assignmentId: DomainId; readonly completedAt: Date | null }
>;

export interface CancelAssignmentCommandInput extends AssignmentIdCommandInput {
	readonly cancelledAt?: Date | null;
	readonly cancellationReason?: string | null;
}

export type CancelAssignmentCommand = FieldWorkDomainCommand<
	'fieldWork.cancelAssignment',
	FieldWorkCommandPayload & {
		readonly assignmentId: DomainId;
		readonly cancelledAt: Date | null;
		readonly cancellationReason: string | null;
	}
>;

export type ReopenAssignmentCommand = FieldWorkDomainCommand<
	'fieldWork.reopenAssignment',
	FieldWorkCommandPayload & { readonly assignmentId: DomainId }
>;

export interface DeleteAssignmentCommandInput extends AssignmentIdCommandInput {
	readonly acknowledgedAssignmentItemDeletion?: boolean;
}

export type DeleteAssignmentCommand = FieldWorkDomainCommand<
	'fieldWork.deleteAssignment',
	FieldWorkCommandPayload & {
		readonly assignmentId: DomainId;
		readonly acknowledgedAssignmentItemDeletion: boolean;
	}
>;

export interface CompleteAssignmentItemCommandInput extends AssignmentItemIdCommandInput {
	readonly completedAt?: Date | null;
}

export type CompleteAssignmentItemCommand = FieldWorkDomainCommand<
	'fieldWork.completeAssignmentItem',
	FieldWorkCommandPayload & {
		readonly assignmentItemId: DomainId;
		readonly completedAt: Date | null;
	}
>;

export type ReopenAssignmentItemCommand = FieldWorkDomainCommand<
	'fieldWork.reopenAssignmentItem',
	FieldWorkCommandPayload & { readonly assignmentItemId: DomainId }
>;

export interface SkipAssignmentItemCommandInput extends AssignmentItemIdCommandInput {
	readonly skippedAt?: Date | null;
	readonly skipReason: string;
}

export type SkipAssignmentItemCommand = FieldWorkDomainCommand<
	'fieldWork.skipAssignmentItem',
	FieldWorkCommandPayload & {
		readonly assignmentItemId: DomainId;
		readonly skippedAt: Date | null;
		readonly skipReason: string;
	}
>;

export type UnskipAssignmentItemCommand = FieldWorkDomainCommand<
	'fieldWork.unskipAssignmentItem',
	FieldWorkCommandPayload & { readonly assignmentItemId: DomainId }
>;

export type FieldWorkCommand =
	| AddCommentCommand
	| UpdateCommentCommand
	| DeleteCommentCommand
	| PinCommentCommand
	| UnpinCommentCommand
	| CreateTagCommand
	| UpdateTagCommand
	| ActivateTagCommand
	| DeactivateTagCommand
	| DeleteTagCommand
	| AssignTagCommand
	| UnassignTagCommand
	| AddAdditionalPersonnelCommand
	| RemoveAdditionalPersonnelCommand
	| CreateRouteCommand
	| UpdateRouteDetailsCommand
	| DeleteRouteCommand
	| AddRouteItemCommand
	| UpdateRouteItemCommand
	| RemoveRouteItemCommand
	| MoveRouteItemsCommand
	| CreateAssignmentCommand
	| CreateAssignmentFromRouteCommand
	| SelfAssignRouteCommand
	| UpdateAssignmentDetailsCommand
	| AddAssignmentItemCommand
	| UpdateAssignmentItemCommand
	| RemoveAssignmentItemCommand
	| MoveAssignmentItemsCommand
	| StartAssignmentCommand
	| CompleteAssignmentCommand
	| CancelAssignmentCommand
	| ReopenAssignmentCommand
	| DeleteAssignmentCommand
	| CompleteAssignmentItemCommand
	| ReopenAssignmentItemCommand
	| SkipAssignmentItemCommand
	| UnskipAssignmentItemCommand;

const COMMENT_TARGET_TYPES = [
	'address',
	'region',
	'trap',
	'collection',
	'habitat',
	'inspection',
	'sample',
	'application',
	'sourceReduction',
	'outreachAction',
	'biocontrolAction',
	'contact',
	'serviceRequest',
	'route',
	'assignment',
	'requestedControlAction',
	'mission',
] as const;

const TAG_TARGET_TYPES = [
	'address',
	'region',
	'trap',
	'habitat',
	'contact',
	'serviceRequest',
] as const;

const ADDITIONAL_PERSONNEL_TARGET_TYPES = [
	'inspection',
	'collection',
	'application',
	'sourceReduction',
	'outreachAction',
	'biocontrolAction',
] as const;

const ROUTE_ITEM_TARGET_TYPES = ['trap', 'habitat'] as const;
const ASSIGNMENT_ITEM_TARGET_TYPES = ['trap', 'habitat', 'serviceRequest'] as const;
const ROUTE_TYPES = ['trap', 'habitat'] as const;

export function addCommentCommand(input: AddCommentCommandInput): AddCommentCommand {
	const issues = createIssues();
	validateBase(input, issues);
	requireUuid(input.commentId, 'commentId', issues);
	const target = validateTarget(input.target, COMMENT_TARGET_TYPES, 'target', issues);
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
	const issues = validateIdCommand(input, 'commentId');
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
	const issues = validateIdCommand(input, 'commentId');
	throwIfIssues('Delete comment command is invalid.', issues);
	return {
		type: 'fieldWork.deleteComment',
		payload: { ...basePayload(input), commentId: normalizeRequiredId(input.commentId) },
	};
}

export function pinCommentCommand(input: CommentIdCommandInput): PinCommentCommand {
	const issues = validateIdCommand(input, 'commentId');
	throwIfIssues('Pin comment command is invalid.', issues);
	return {
		type: 'fieldWork.pinComment',
		payload: { ...basePayload(input), commentId: normalizeRequiredId(input.commentId) },
	};
}

export function unpinCommentCommand(input: CommentIdCommandInput): UnpinCommentCommand {
	const issues = validateIdCommand(input, 'commentId');
	throwIfIssues('Unpin comment command is invalid.', issues);
	return {
		type: 'fieldWork.unpinComment',
		payload: { ...basePayload(input), commentId: normalizeRequiredId(input.commentId) },
	};
}

export function createTagCommand(input: CreateTagCommandInput): CreateTagCommand {
	const issues = createIssues();
	validateBase(input, issues);
	requireUuid(input.tagId, 'tagId', issues);
	const tagName = normalizeRequiredText(input.tagName, 'tagName', issues, 200);
	const description = normalizeNullableText(input.description, 'description', issues, 2_000);
	const color = normalizeHexColor(input.color, 'color', issues);
	throwIfIssues('Create tag command is invalid.', issues);

	return {
		type: 'fieldWork.createTag',
		payload: {
			...basePayload(input),
			tagId: normalizeRequiredId(input.tagId),
			tagName,
			description,
			color,
		},
	};
}

export function updateTagCommand(input: UpdateTagCommandInput): UpdateTagCommand {
	const issues = validateIdCommand(input, 'tagId');
	const hasName = input.tagName !== undefined;
	const hasDescription = input.description !== undefined;
	const hasColor = input.color !== undefined;
	if (!hasName && !hasDescription && !hasColor) {
		issues.push({ path: 'changes', message: 'At least one tag field must change.' });
	}
	const tagName = hasName
		? normalizeRequiredText(input.tagName, 'tagName', issues, 200)
		: undefined;
	const description = hasDescription
		? normalizeNullableText(input.description, 'description', issues, 2_000)
		: undefined;
	const color = hasColor ? normalizeHexColor(input.color, 'color', issues) : undefined;
	throwIfIssues('Update tag command is invalid.', issues);

	return {
		type: 'fieldWork.updateTag',
		payload: {
			...basePayload(input),
			tagId: normalizeRequiredId(input.tagId),
			changes: {
				...(tagName !== undefined ? { tagName } : {}),
				...(hasDescription ? { description: description ?? null } : {}),
				...(hasColor ? { color: color ?? null } : {}),
			},
		},
	};
}

export function activateTagCommand(input: TagIdCommandInput): ActivateTagCommand {
	const issues = validateIdCommand(input, 'tagId');
	throwIfIssues('Activate tag command is invalid.', issues);
	return { type: 'fieldWork.activateTag', payload: tagIdPayload(input) };
}

export function deactivateTagCommand(input: TagIdCommandInput): DeactivateTagCommand {
	const issues = validateIdCommand(input, 'tagId');
	throwIfIssues('Deactivate tag command is invalid.', issues);
	return { type: 'fieldWork.deactivateTag', payload: tagIdPayload(input) };
}

export function deleteTagCommand(input: TagIdCommandInput): DeleteTagCommand {
	const issues = validateIdCommand(input, 'tagId');
	throwIfIssues('Delete tag command is invalid.', issues);
	return { type: 'fieldWork.deleteTag', payload: tagIdPayload(input) };
}

export function assignTagCommand(input: AssignTagCommandInput): AssignTagCommand {
	const issues = createIssues();
	validateBase(input, issues);
	requireUuid(input.tagItemId, 'tagItemId', issues);
	requireUuid(input.tagId, 'tagId', issues);
	const target = validateTarget(input.target, TAG_TARGET_TYPES, 'target', issues);
	throwIfIssues('Assign tag command is invalid.', issues);

	return {
		type: 'fieldWork.assignTag',
		payload: {
			...basePayload(input),
			tagItemId: normalizeRequiredId(input.tagItemId),
			tagId: normalizeRequiredId(input.tagId),
			target,
		},
	};
}

export function unassignTagCommand(input: UnassignTagCommandInput): UnassignTagCommand {
	const issues = validateIdCommand(input, 'tagItemId');
	throwIfIssues('Unassign tag command is invalid.', issues);
	return {
		type: 'fieldWork.unassignTag',
		payload: { ...basePayload(input), tagItemId: normalizeRequiredId(input.tagItemId) },
	};
}

export function addAdditionalPersonnelCommand(
	input: AddAdditionalPersonnelCommandInput,
): AddAdditionalPersonnelCommand {
	const issues = createIssues();
	validateBase(input, issues);
	requireUuid(input.additionalPersonnelId, 'additionalPersonnelId', issues);
	requireUuid(input.personnelProfileId, 'personnelProfileId', issues);
	const target = validateTarget(input.target, ADDITIONAL_PERSONNEL_TARGET_TYPES, 'target', issues);
	throwIfIssues('Add additional personnel command is invalid.', issues);

	return {
		type: 'fieldWork.addAdditionalPersonnel',
		payload: {
			...basePayload(input),
			additionalPersonnelId: normalizeRequiredId(input.additionalPersonnelId),
			target,
			personnelProfileId: normalizeRequiredId(input.personnelProfileId),
		},
	};
}

export function removeAdditionalPersonnelCommand(
	input: RemoveAdditionalPersonnelCommandInput,
): RemoveAdditionalPersonnelCommand {
	const issues = validateIdCommand(input, 'additionalPersonnelId');
	throwIfIssues('Remove additional personnel command is invalid.', issues);
	return {
		type: 'fieldWork.removeAdditionalPersonnel',
		payload: {
			...basePayload(input),
			additionalPersonnelId: normalizeRequiredId(input.additionalPersonnelId),
		},
	};
}

export function createRouteCommand(input: CreateRouteCommandInput): CreateRouteCommand {
	const issues = createIssues();
	validateBase(input, issues);
	requireUuid(input.routeId, 'routeId', issues);
	const routeName = normalizeRequiredText(input.routeName, 'routeName', issues, 200);
	const routeType = normalizeStringUnion(input.routeType, ROUTE_TYPES, 'routeType', issues);
	throwIfIssues('Create route command is invalid.', issues);

	return {
		type: 'fieldWork.createRoute',
		payload: {
			...basePayload(input),
			routeId: normalizeRequiredId(input.routeId),
			routeName,
			routeType,
		},
	};
}

export function updateRouteDetailsCommand(
	input: UpdateRouteDetailsCommandInput,
): UpdateRouteDetailsCommand {
	const issues = validateIdCommand(input, 'routeId');
	const hasName = input.routeName !== undefined;
	if (!hasName) {
		issues.push({ path: 'changes', message: 'At least one route detail must change.' });
	}
	const routeName = hasName
		? normalizeRequiredText(input.routeName, 'routeName', issues, 200)
		: undefined;
	throwIfIssues('Update route details command is invalid.', issues);

	return {
		type: 'fieldWork.updateRouteDetails',
		payload: {
			...basePayload(input),
			routeId: normalizeRequiredId(input.routeId),
			changes: { ...(routeName !== undefined ? { routeName } : {}) },
		},
	};
}

export function deleteRouteCommand(input: DeleteRouteCommandInput): DeleteRouteCommand {
	const issues = validateIdCommand(input, 'routeId');
	throwIfIssues('Delete route command is invalid.', issues);
	return {
		type: 'fieldWork.deleteRoute',
		payload: {
			...basePayload(input),
			routeId: normalizeRequiredId(input.routeId),
			acknowledgedRouteItemDeletion: input.acknowledgedRouteItemDeletion ?? false,
		},
	};
}

export function addRouteItemCommand(input: AddRouteItemCommandInput): AddRouteItemCommand {
	const issues = createIssues();
	validateBase(input, issues);
	requireUuid(input.routeItemId, 'routeItemId', issues);
	requireUuid(input.routeId, 'routeId', issues);
	const target = validateTarget(input.target, ROUTE_ITEM_TARGET_TYPES, 'target', issues);
	const placement = validateRoutePlacement(input.placement ?? { kind: 'end' }, 'placement', issues);
	const directionsToNextItem = normalizeNullableText(
		input.directionsToNextItem,
		'directionsToNextItem',
		issues,
		4_000,
	);
	throwIfIssues('Add route item command is invalid.', issues);

	return {
		type: 'fieldWork.addRouteItem',
		payload: {
			...basePayload(input),
			routeItemId: normalizeRequiredId(input.routeItemId),
			routeId: normalizeRequiredId(input.routeId),
			target,
			placement,
			directionsToNextItem,
		},
	};
}

export function updateRouteItemCommand(input: UpdateRouteItemCommandInput): UpdateRouteItemCommand {
	const issues = validateIdCommand(input, 'routeItemId');
	const hasDirections = input.directionsToNextItem !== undefined;
	if (!hasDirections) {
		issues.push({ path: 'changes', message: 'At least one route item field must change.' });
	}
	const directionsToNextItem = hasDirections
		? normalizeNullableText(input.directionsToNextItem, 'directionsToNextItem', issues, 4_000)
		: undefined;
	throwIfIssues('Update route item command is invalid.', issues);

	return {
		type: 'fieldWork.updateRouteItem',
		payload: {
			...basePayload(input),
			routeItemId: normalizeRequiredId(input.routeItemId),
			changes: { ...(hasDirections ? { directionsToNextItem: directionsToNextItem ?? null } : {}) },
		},
	};
}

export function removeRouteItemCommand(input: RouteItemIdCommandInput): RemoveRouteItemCommand {
	const issues = validateIdCommand(input, 'routeItemId');
	throwIfIssues('Remove route item command is invalid.', issues);
	return {
		type: 'fieldWork.removeRouteItem',
		payload: { ...basePayload(input), routeItemId: normalizeRequiredId(input.routeItemId) },
	};
}

export function moveRouteItemsCommand(input: MoveRouteItemsCommandInput): MoveRouteItemsCommand {
	const issues = createIssues();
	validateBase(input, issues);
	requireUuid(input.routeId, 'routeId', issues);
	const routeItemIds = validateIdList(input.routeItemIds, 'routeItemIds', issues);
	const placement = validateRoutePlacement(input.placement, 'placement', issues);
	throwIfIssues('Move route items command is invalid.', issues);

	return {
		type: 'fieldWork.moveRouteItems',
		payload: {
			...basePayload(input),
			routeId: normalizeRequiredId(input.routeId),
			routeItemIds,
			placement,
		},
	};
}

export function createAssignmentCommand(
	input: CreateAssignmentCommandInput,
): CreateAssignmentCommand {
	const issues = createIssues();
	validateAssignmentCreateBase(input, issues);
	throwIfIssues('Create assignment command is invalid.', issues);

	return {
		type: 'fieldWork.createAssignment',
		payload: assignmentCreatePayload(input),
	};
}

export function createAssignmentFromRouteCommand(
	input: CreateAssignmentFromRouteCommandInput,
): CreateAssignmentFromRouteCommand {
	const issues = createIssues();
	validateAssignmentCreateBase(input, issues);
	requireUuid(input.routeId, 'routeId', issues);
	const assignmentItemIds = validateRouteAssignmentItemIdMappings(input.assignmentItemIds, issues);
	throwIfIssues('Create assignment from route command is invalid.', issues);

	return {
		type: 'fieldWork.createAssignmentFromRoute',
		payload: {
			...assignmentCreatePayload(input),
			routeId: normalizeRequiredId(input.routeId),
			assignmentItemIds,
		},
	};
}

export function selfAssignRouteCommand(input: SelfAssignRouteCommandInput): SelfAssignRouteCommand {
	const issues = createIssues();
	validateBase(input, issues);
	requireUuid(input.assignmentId, 'assignmentId', issues);
	requireUuid(input.routeId, 'routeId', issues);
	const assignmentItemIds = validateRouteAssignmentItemIdMappings(input.assignmentItemIds, issues);
	throwIfIssues('Self-assign route command is invalid.', issues);

	return {
		type: 'fieldWork.selfAssignRoute',
		payload: {
			...basePayload(input),
			assignmentId: normalizeRequiredId(input.assignmentId),
			routeId: normalizeRequiredId(input.routeId),
			assignmentItemIds,
		},
	};
}

export function updateAssignmentDetailsCommand(
	input: UpdateAssignmentDetailsCommandInput,
): UpdateAssignmentDetailsCommand {
	const issues = validateIdCommand(input, 'assignmentId');
	const hasDate = input.assignmentDate !== undefined;
	const hasName = input.assignmentName !== undefined;
	const hasAssignedTo = input.assignedToProfileId !== undefined;
	const hasDueAt = input.dueAt !== undefined;
	if (!hasDate && !hasName && !hasAssignedTo && !hasDueAt) {
		issues.push({ path: 'changes', message: 'At least one assignment detail must change.' });
	}
	if (hasDate) {
		validateLocalDate(input.assignmentDate, 'assignmentDate', issues);
	}
	const assignmentName = hasName
		? normalizeNullableText(input.assignmentName, 'assignmentName', issues, 200)
		: undefined;
	const assignedToProfileId = hasAssignedTo
		? normalizeOptionalUuid(input.assignedToProfileId, 'assignedToProfileId', issues)
		: undefined;
	const dueAt = hasDueAt
		? normalizeOptionalTimestamp(input.dueAt, 'dueAt', issues, true)
		: undefined;
	throwIfIssues('Update assignment details command is invalid.', issues);

	return {
		type: 'fieldWork.updateAssignmentDetails',
		payload: {
			...basePayload(input),
			assignmentId: normalizeRequiredId(input.assignmentId),
			changes: {
				...(hasDate ? { assignmentDate: input.assignmentDate } : {}),
				...(hasName ? { assignmentName: assignmentName ?? null } : {}),
				...(hasAssignedTo ? { assignedToProfileId: assignedToProfileId ?? null } : {}),
				...(hasDueAt ? { dueAt: dueAt ?? null } : {}),
			},
		},
	};
}

export function addAssignmentItemCommand(
	input: AddAssignmentItemCommandInput,
): AddAssignmentItemCommand {
	const issues = createIssues();
	validateBase(input, issues);
	requireUuid(input.assignmentItemId, 'assignmentItemId', issues);
	requireUuid(input.assignmentId, 'assignmentId', issues);
	const target = validateTarget(input.target, ASSIGNMENT_ITEM_TARGET_TYPES, 'target', issues);
	const placement = validateAssignmentPlacement(
		input.placement ?? { kind: 'end' },
		'placement',
		issues,
	);
	const directionsToNextItem = normalizeNullableText(
		input.directionsToNextItem,
		'directionsToNextItem',
		issues,
		4_000,
	);
	throwIfIssues('Add assignment item command is invalid.', issues);

	return {
		type: 'fieldWork.addAssignmentItem',
		payload: {
			...basePayload(input),
			assignmentItemId: normalizeRequiredId(input.assignmentItemId),
			assignmentId: normalizeRequiredId(input.assignmentId),
			target,
			placement,
			directionsToNextItem,
		},
	};
}

export function updateAssignmentItemCommand(
	input: UpdateAssignmentItemCommandInput,
): UpdateAssignmentItemCommand {
	const issues = validateIdCommand(input, 'assignmentItemId');
	const hasDirections = input.directionsToNextItem !== undefined;
	if (!hasDirections) {
		issues.push({ path: 'changes', message: 'At least one assignment item field must change.' });
	}
	const directionsToNextItem = hasDirections
		? normalizeNullableText(input.directionsToNextItem, 'directionsToNextItem', issues, 4_000)
		: undefined;
	throwIfIssues('Update assignment item command is invalid.', issues);

	return {
		type: 'fieldWork.updateAssignmentItem',
		payload: {
			...basePayload(input),
			assignmentItemId: normalizeRequiredId(input.assignmentItemId),
			changes: { ...(hasDirections ? { directionsToNextItem: directionsToNextItem ?? null } : {}) },
		},
	};
}

export function removeAssignmentItemCommand(
	input: AssignmentItemIdCommandInput,
): RemoveAssignmentItemCommand {
	const issues = validateIdCommand(input, 'assignmentItemId');
	throwIfIssues('Remove assignment item command is invalid.', issues);
	return {
		type: 'fieldWork.removeAssignmentItem',
		payload: {
			...basePayload(input),
			assignmentItemId: normalizeRequiredId(input.assignmentItemId),
		},
	};
}

export function moveAssignmentItemsCommand(
	input: MoveAssignmentItemsCommandInput,
): MoveAssignmentItemsCommand {
	const issues = createIssues();
	validateBase(input, issues);
	requireUuid(input.assignmentId, 'assignmentId', issues);
	const assignmentItemIds = validateIdList(input.assignmentItemIds, 'assignmentItemIds', issues);
	const placement = validateAssignmentPlacement(input.placement, 'placement', issues);
	throwIfIssues('Move assignment items command is invalid.', issues);

	return {
		type: 'fieldWork.moveAssignmentItems',
		payload: {
			...basePayload(input),
			assignmentId: normalizeRequiredId(input.assignmentId),
			assignmentItemIds,
			placement,
		},
	};
}

export function startAssignmentCommand(input: StartAssignmentCommandInput): StartAssignmentCommand {
	const issues = validateIdCommand(input, 'assignmentId');
	const startedAt = normalizeOptionalTimestamp(input.startedAt, 'startedAt', issues, false);
	throwIfIssues('Start assignment command is invalid.', issues);
	return {
		type: 'fieldWork.startAssignment',
		payload: {
			...basePayload(input),
			assignmentId: normalizeRequiredId(input.assignmentId),
			startedAt,
		},
	};
}

export function completeAssignmentCommand(
	input: CompleteAssignmentCommandInput,
): CompleteAssignmentCommand {
	const issues = validateIdCommand(input, 'assignmentId');
	const completedAt = normalizeOptionalTimestamp(input.completedAt, 'completedAt', issues, false);
	throwIfIssues('Complete assignment command is invalid.', issues);
	return {
		type: 'fieldWork.completeAssignment',
		payload: {
			...basePayload(input),
			assignmentId: normalizeRequiredId(input.assignmentId),
			completedAt,
		},
	};
}

export function cancelAssignmentCommand(
	input: CancelAssignmentCommandInput,
): CancelAssignmentCommand {
	const issues = validateIdCommand(input, 'assignmentId');
	const cancelledAt = normalizeOptionalTimestamp(input.cancelledAt, 'cancelledAt', issues, false);
	const cancellationReason = normalizeNullableText(
		input.cancellationReason,
		'cancellationReason',
		issues,
		2_000,
	);
	throwIfIssues('Cancel assignment command is invalid.', issues);
	return {
		type: 'fieldWork.cancelAssignment',
		payload: {
			...basePayload(input),
			assignmentId: normalizeRequiredId(input.assignmentId),
			cancelledAt,
			cancellationReason,
		},
	};
}

export function reopenAssignmentCommand(input: AssignmentIdCommandInput): ReopenAssignmentCommand {
	const issues = validateIdCommand(input, 'assignmentId');
	throwIfIssues('Reopen assignment command is invalid.', issues);
	return {
		type: 'fieldWork.reopenAssignment',
		payload: { ...basePayload(input), assignmentId: normalizeRequiredId(input.assignmentId) },
	};
}

export function deleteAssignmentCommand(
	input: DeleteAssignmentCommandInput,
): DeleteAssignmentCommand {
	const issues = validateIdCommand(input, 'assignmentId');
	throwIfIssues('Delete assignment command is invalid.', issues);
	return {
		type: 'fieldWork.deleteAssignment',
		payload: {
			...basePayload(input),
			assignmentId: normalizeRequiredId(input.assignmentId),
			acknowledgedAssignmentItemDeletion: input.acknowledgedAssignmentItemDeletion ?? false,
		},
	};
}

export function completeAssignmentItemCommand(
	input: CompleteAssignmentItemCommandInput,
): CompleteAssignmentItemCommand {
	const issues = validateIdCommand(input, 'assignmentItemId');
	const completedAt = normalizeOptionalTimestamp(input.completedAt, 'completedAt', issues, false);
	throwIfIssues('Complete assignment item command is invalid.', issues);
	return {
		type: 'fieldWork.completeAssignmentItem',
		payload: {
			...basePayload(input),
			assignmentItemId: normalizeRequiredId(input.assignmentItemId),
			completedAt,
		},
	};
}

export function reopenAssignmentItemCommand(
	input: AssignmentItemIdCommandInput,
): ReopenAssignmentItemCommand {
	const issues = validateIdCommand(input, 'assignmentItemId');
	throwIfIssues('Reopen assignment item command is invalid.', issues);
	return {
		type: 'fieldWork.reopenAssignmentItem',
		payload: {
			...basePayload(input),
			assignmentItemId: normalizeRequiredId(input.assignmentItemId),
		},
	};
}

export function skipAssignmentItemCommand(
	input: SkipAssignmentItemCommandInput,
): SkipAssignmentItemCommand {
	const issues = validateIdCommand(input, 'assignmentItemId');
	const skippedAt = normalizeOptionalTimestamp(input.skippedAt, 'skippedAt', issues, false);
	const skipReason = normalizeRequiredText(input.skipReason, 'skipReason', issues, 2_000);
	throwIfIssues('Skip assignment item command is invalid.', issues);
	return {
		type: 'fieldWork.skipAssignmentItem',
		payload: {
			...basePayload(input),
			assignmentItemId: normalizeRequiredId(input.assignmentItemId),
			skippedAt,
			skipReason,
		},
	};
}

export function unskipAssignmentItemCommand(
	input: AssignmentItemIdCommandInput,
): UnskipAssignmentItemCommand {
	const issues = validateIdCommand(input, 'assignmentItemId');
	throwIfIssues('Unskip assignment item command is invalid.', issues);
	return {
		type: 'fieldWork.unskipAssignmentItem',
		payload: {
			...basePayload(input),
			assignmentItemId: normalizeRequiredId(input.assignmentItemId),
		},
	};
}

function validateAssignmentCreateBase(
	input: CreateAssignmentCommandInput | CreateAssignmentFromRouteCommandInput,
	issues: DomainValidationIssue[],
): void {
	validateBase(input, issues);
	requireUuid(input.assignmentId, 'assignmentId', issues);
	validateLocalDate(input.assignmentDate, 'assignmentDate', issues);
	normalizeOptionalUuid(input.assignedToProfileId, 'assignedToProfileId', issues);
	normalizeOptionalTimestamp(input.dueAt, 'dueAt', issues, true);
	normalizeNullableText(input.assignmentName, 'assignmentName', issues, 200);
}

function assignmentCreatePayload(
	input: CreateAssignmentCommandInput | CreateAssignmentFromRouteCommandInput,
): CreateAssignmentCommand['payload'] {
	const issues = createIssues();
	return {
		...basePayload(input),
		assignmentId: normalizeRequiredId(input.assignmentId),
		assignmentDate: input.assignmentDate,
		assignmentName: normalizeNullableText(input.assignmentName, 'assignmentName', issues, 200),
		assignedToProfileId: normalizeOptionalUuid(
			input.assignedToProfileId,
			'assignedToProfileId',
			issues,
		),
		dueAt: normalizeOptionalTimestamp(input.dueAt, 'dueAt', issues, true),
	};
}

function validateRouteAssignmentItemIdMappings(
	mappings: readonly RouteAssignmentItemIdMapping[],
	issues: DomainValidationIssue[],
): readonly RouteAssignmentItemIdMapping[] {
	if (!Array.isArray(mappings) || mappings.length === 0) {
		issues.push({
			path: 'assignmentItemIds',
			message: 'assignmentItemIds must include at least one mapping.',
		});
		return [];
	}

	const routeItemIds = new Set<string>();
	const assignmentItemIds = new Set<string>();
	return mappings.map((mapping, index) => {
		requireUuid(mapping.routeItemId, `assignmentItemIds.${index}.routeItemId`, issues);
		requireUuid(mapping.assignmentItemId, `assignmentItemIds.${index}.assignmentItemId`, issues);
		const routeItemId = normalizeRequiredId(mapping.routeItemId);
		const assignmentItemId = normalizeRequiredId(mapping.assignmentItemId);
		if (routeItemIds.has(routeItemId)) {
			issues.push({
				path: `assignmentItemIds.${index}.routeItemId`,
				message: 'routeItemId values must be unique.',
			});
		}
		if (assignmentItemIds.has(assignmentItemId)) {
			issues.push({
				path: `assignmentItemIds.${index}.assignmentItemId`,
				message: 'assignmentItemId values must be unique.',
			});
		}
		routeItemIds.add(routeItemId);
		assignmentItemIds.add(assignmentItemId);
		return { routeItemId, assignmentItemId };
	});
}

function validateRoutePlacement(
	placement: RouteItemPlacement | undefined,
	path: string,
	issues: DomainValidationIssue[],
): RouteItemPlacement {
	if (placement === undefined || !['start', 'end', 'before', 'after'].includes(placement.kind)) {
		issues.push({ path, message: 'placement is not supported.' });
		return { kind: 'end' };
	}
	if (placement.kind === 'before' || placement.kind === 'after') {
		requireUuid(placement.routeItemId, `${path}.routeItemId`, issues);
		return { kind: placement.kind, routeItemId: normalizeRequiredId(placement.routeItemId) };
	}
	return { kind: placement.kind };
}

function validateAssignmentPlacement(
	placement: AssignmentItemPlacement | undefined,
	path: string,
	issues: DomainValidationIssue[],
): AssignmentItemPlacement {
	if (placement === undefined || !['start', 'end', 'before', 'after'].includes(placement.kind)) {
		issues.push({ path, message: 'placement is not supported.' });
		return { kind: 'end' };
	}
	if (placement.kind === 'before' || placement.kind === 'after') {
		requireUuid(placement.assignmentItemId, `${path}.assignmentItemId`, issues);
		return {
			kind: placement.kind,
			assignmentItemId: normalizeRequiredId(placement.assignmentItemId),
		};
	}
	return { kind: placement.kind };
}

function validateIdList(
	values: readonly DomainId[],
	path: string,
	issues: DomainValidationIssue[],
): readonly DomainId[] {
	if (!Array.isArray(values) || values.length === 0) {
		issues.push({ path, message: `${path} must include at least one id.` });
		return [];
	}
	const seen = new Set<string>();
	return values.map((value, index) => {
		requireUuid(value, `${path}.${index}`, issues);
		const normalized = normalizeRequiredId(value);
		if (seen.has(normalized)) {
			issues.push({ path: `${path}.${index}`, message: `${path} must not contain duplicates.` });
		}
		seen.add(normalized);
		return normalized;
	});
}

function validateTarget<TType extends string>(
	target: EntityTarget<TType>,
	allowedTypes: readonly TType[],
	path: string,
	issues: DomainValidationIssue[],
): EntityTarget<TType> {
	const type = normalizeStringUnion(target?.type, allowedTypes, `${path}.type`, issues);
	requireUuid(target?.id, `${path}.id`, issues);
	return { type, id: normalizeRequiredId(target?.id) };
}

function validateBase(input: FieldWorkCommandInput, issues: DomainValidationIssue[]): void {
	requireUuid(input.organizationId, 'organizationId', issues);
	requireUuid(input.actorProfileId, 'actorProfileId', issues);
}

function validateIdCommand<T extends FieldWorkCommandInput>(
	input: T,
	idKey: keyof T & string,
): DomainValidationIssue[] {
	const issues = createIssues();
	validateBase(input, issues);
	requireUuid(input[idKey] as string | undefined, idKey, issues);
	return issues;
}

function basePayload(input: FieldWorkCommandInput): FieldWorkCommandPayload {
	return {
		organizationId: normalizeRequiredId(input.organizationId),
		actorProfileId: normalizeRequiredId(input.actorProfileId),
	};
}

function tagIdPayload(
	input: TagIdCommandInput,
): FieldWorkCommandPayload & { readonly tagId: DomainId } {
	return { ...basePayload(input), tagId: normalizeRequiredId(input.tagId) };
}

function validateLocalDate(
	value: LocalDateString | undefined,
	path: string,
	issues: DomainValidationIssue[],
): void {
	if (value === undefined || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
		issues.push({ path, message: `${path} must be a YYYY-MM-DD date string.` });
		return;
	}
	const parsed = new Date(`${value}T00:00:00.000Z`);
	if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
		issues.push({ path, message: `${path} must be a valid calendar date.` });
	}
}

function normalizeOptionalTimestamp(
	value: Date | null | undefined,
	path: string,
	issues: DomainValidationIssue[],
	allowFuture: boolean,
): Date | null {
	if (value === undefined || value === null) {
		return null;
	}
	if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
		issues.push({ path, message: `${path} must be a valid Date.` });
		return null;
	}
	if (!allowFuture && value.getTime() > Date.now()) {
		issues.push({ path, message: `${path} cannot be in the future.` });
	}
	return value;
}

function requireUuid(
	value: string | null | undefined,
	path: string,
	issues: DomainValidationIssue[],
): void {
	const normalized = normalizeOptionalId(value);
	if (normalized === null) {
		issues.push({ path, message: `${path} is required.` });
		return;
	}
	if (!isUuid(normalized)) {
		issues.push({ path, message: `${path} must be a UUID.` });
	}
}

function normalizeOptionalUuid(
	value: string | null | undefined,
	path: string,
	issues: DomainValidationIssue[],
): string | null {
	const normalized = normalizeOptionalId(value);
	if (normalized !== null && !isUuid(normalized)) {
		issues.push({ path, message: `${path} must be a UUID.` });
	}
	return normalized;
}

function normalizeRequiredId(value: string | null | undefined): string {
	return normalizeOptionalId(value) ?? '';
}

function normalizeOptionalId(value: string | null | undefined): string | null {
	if (value === undefined || value === null) {
		return null;
	}
	const trimmed = value.trim();
	return trimmed.length === 0 ? null : trimmed;
}

function normalizeStringUnion<TValue extends string>(
	value: string | undefined,
	allowedValues: readonly TValue[],
	path: string,
	issues: DomainValidationIssue[],
): TValue {
	if (value === undefined || !allowedValues.includes(value as TValue)) {
		issues.push({ path, message: `${path} is not supported.` });
		return (allowedValues[0] ?? '') as TValue;
	}
	return value as TValue;
}

function normalizeRequiredText(
	value: string | null | undefined,
	path: string,
	issues: DomainValidationIssue[],
	maxLength: number,
): string {
	const normalized = normalizeNullableText(value, path, issues, maxLength);
	if (normalized === null) {
		issues.push({ path, message: `${path} is required.` });
		return '';
	}
	return normalized;
}

function normalizeNullableText(
	value: string | null | undefined,
	path: string,
	issues: DomainValidationIssue[],
	maxLength: number,
): string | null {
	if (value === undefined || value === null) {
		return null;
	}
	const trimmed = value.trim();
	if (trimmed.length === 0) {
		return null;
	}
	if (trimmed.length > maxLength) {
		issues.push({ path, message: `${path} must be ${maxLength} characters or fewer.` });
	}
	return trimmed;
}

function normalizeHexColor(
	value: string | null | undefined,
	path: string,
	issues: DomainValidationIssue[],
): string | null {
	const normalized = normalizeNullableText(value, path, issues, 7);
	if (normalized === null) {
		return null;
	}
	if (!/^#[0-9a-fA-F]{6}$/.test(normalized)) {
		issues.push({ path, message: `${path} must be a #RRGGBB hex color.` });
		return null;
	}
	return normalized.toLowerCase();
}

function isUuid(value: string): boolean {
	return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function createIssues(): DomainValidationIssue[] {
	return [];
}

function throwIfIssues(message: string, issues: readonly DomainValidationIssue[]): void {
	if (issues.length > 0) {
		throw new DomainValidationError(message, issues);
	}
}
