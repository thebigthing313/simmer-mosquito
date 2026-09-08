import {
	basePayload,
	createIssues,
	nullableText as normalizeNullableText,
	requiredId as normalizeRequiredId,
	requiredText as normalizeRequiredText,
	requiredUuid as requireUuid,
	throwIfIssues,
	validateBase,
	validateIdCommand,
} from '../command-validation.js';
import type { DomainId } from '../shared.js';
import {
	nullableTextField,
	requiredTextField,
	type UpdateFieldSet,
	type UpdateFieldsChanges,
	type UpdateFieldsInput,
	updateFieldsCommand,
} from '../update-command-fields.js';
import {
	type FieldWorkCommandInput,
	type FieldWorkCommandPayload,
	type FieldWorkDomainCommand,
	normalizeHexColor,
	TAG_TARGET_TYPES,
	type TagTarget,
	validateTarget,
} from './shared.js';

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

export const TAG_UPDATE_FIELDS = {
	tagName: requiredTextField(200),
	description: nullableTextField(2_000),
	color: normalizeHexColor,
} satisfies UpdateFieldSet;

export type UpdateTagCommandInput = FieldWorkCommandInput &
	UpdateFieldsInput<typeof TAG_UPDATE_FIELDS> & {
		readonly tagId: DomainId;
	};

export type UpdateTagCommand = FieldWorkDomainCommand<
	'fieldWork.updateTag',
	FieldWorkCommandPayload & {
		readonly tagId: DomainId;
		readonly changes: UpdateFieldsChanges<typeof TAG_UPDATE_FIELDS>;
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
	return updateFieldsCommand({
		type: 'fieldWork.updateTag',
		input,
		idKey: 'tagId',
		fields: TAG_UPDATE_FIELDS,
		changeNoun: 'tag',
		message: 'Update tag command is invalid.',
	});
}

function tagIdPayload(
	input: TagIdCommandInput,
): FieldWorkCommandPayload & { readonly tagId: DomainId } {
	return { ...basePayload(input), tagId: normalizeRequiredId(input.tagId) };
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
	const target = validateTarget(input.target, TAG_TARGET_TYPES, 'target', issues, requireUuid);
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
