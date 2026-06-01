import {
	createIssues,
	nullableText as normalizeNullableText,
	optionalUuid as normalizeOptionalUuid,
	requiredId as normalizeRequiredId,
	requiredText as normalizeRequiredText,
	requiredUuid as requireUuid,
	throwIfIssues,
} from '../command-validation.js';
import type { DomainId, DomainValidationIssue, LocalDateString } from '../shared.js';
import {
	ASSIGNMENT_ITEM_TARGET_TYPES,
	type AssignmentItemPlacement,
	type AssignmentItemTarget,
	basePayload,
	type FieldWorkCommandInput,
	type FieldWorkCommandPayload,
	type FieldWorkDomainCommand,
	normalizeOptionalTimestamp,
	type RouteAssignmentItemIdMapping,
	validateAssignmentPlacement,
	validateBase,
	validateIdCommand,
	validateIdList,
	validateLocalDate,
	validateTarget,
} from './shared.js';

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
	const issues = validateIdCommand(input, 'assignmentId', requireUuid);
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
	const target = validateTarget(
		input.target,
		ASSIGNMENT_ITEM_TARGET_TYPES,
		'target',
		issues,
		requireUuid,
	);
	const placement = validateAssignmentPlacement(
		input.placement ?? { kind: 'end' },
		'placement',
		issues,
		requireUuid,
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
	const issues = validateIdCommand(input, 'assignmentItemId', requireUuid);
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
	const issues = validateIdCommand(input, 'assignmentItemId', requireUuid);
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
	const assignmentItemIds = validateIdList(
		input.assignmentItemIds,
		'assignmentItemIds',
		issues,
		requireUuid,
	);
	const placement = validateAssignmentPlacement(input.placement, 'placement', issues, requireUuid);
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
	const issues = validateIdCommand(input, 'assignmentId', requireUuid);
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
	const issues = validateIdCommand(input, 'assignmentId', requireUuid);
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
	const issues = validateIdCommand(input, 'assignmentId', requireUuid);
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
	const issues = validateIdCommand(input, 'assignmentId', requireUuid);
	throwIfIssues('Reopen assignment command is invalid.', issues);
	return {
		type: 'fieldWork.reopenAssignment',
		payload: { ...basePayload(input), assignmentId: normalizeRequiredId(input.assignmentId) },
	};
}

export function deleteAssignmentCommand(
	input: DeleteAssignmentCommandInput,
): DeleteAssignmentCommand {
	const issues = validateIdCommand(input, 'assignmentId', requireUuid);
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
	const issues = validateIdCommand(input, 'assignmentItemId', requireUuid);
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
	const issues = validateIdCommand(input, 'assignmentItemId', requireUuid);
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
	const issues = validateIdCommand(input, 'assignmentItemId', requireUuid);
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
	const issues = validateIdCommand(input, 'assignmentItemId', requireUuid);
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
