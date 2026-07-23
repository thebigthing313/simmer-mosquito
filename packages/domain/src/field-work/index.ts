export * from './additional-personnel.js';
export * from './assignments.js';
export * from './comments.js';
export * from './routes.js';
export type {
	AdditionalPersonnelTarget,
	AdditionalPersonnelTargetType,
	AssignmentItemPlacement,
	AssignmentItemTarget,
	AssignmentItemTargetType,
	CommentTarget,
	CommentTargetType,
	EntityTarget,
	FieldWorkCommandType,
	FieldWorkDomainCommand,
	RouteAssignmentItemIdMapping,
	RouteItemPlacement,
	RouteItemTarget,
	RouteItemTargetType,
	RouteType,
	TagTarget,
	TagTargetType,
} from './shared.js';
export { toDbEntityType } from './shared.js';
export * from './tags.js';

import type {
	AddAdditionalPersonnelCommand,
	RemoveAdditionalPersonnelCommand,
} from './additional-personnel.js';
import type {
	AddAssignmentItemCommand,
	CancelAssignmentCommand,
	CompleteAssignmentCommand,
	CompleteAssignmentItemCommand,
	CreateAssignmentCommand,
	CreateAssignmentFromRouteCommand,
	DeleteAssignmentCommand,
	MoveAssignmentItemsCommand,
	RemoveAssignmentItemCommand,
	ReopenAssignmentCommand,
	ReopenAssignmentItemCommand,
	SelfAssignRouteCommand,
	SkipAssignmentItemCommand,
	StartAssignmentCommand,
	UnskipAssignmentItemCommand,
	UpdateAssignmentDetailsCommand,
	UpdateAssignmentItemCommand,
} from './assignments.js';
import type {
	AddCommentCommand,
	DeleteCommentCommand,
	PinCommentCommand,
	UnpinCommentCommand,
	UpdateCommentCommand,
} from './comments.js';
import type {
	AddRouteItemCommand,
	CreateRouteCommand,
	DeleteRouteCommand,
	MoveRouteItemsCommand,
	RemoveRouteItemCommand,
	UpdateRouteDetailsCommand,
	UpdateRouteItemCommand,
} from './routes.js';
import type {
	ActivateTagCommand,
	AssignTagCommand,
	CreateTagCommand,
	DeactivateTagCommand,
	DeleteTagCommand,
	UnassignTagCommand,
	UpdateTagCommand,
} from './tags.js';

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
