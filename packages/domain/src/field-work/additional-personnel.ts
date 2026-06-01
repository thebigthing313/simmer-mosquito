import {
	createIssues,
	requiredId as normalizeRequiredId,
	requiredUuid as requireUuid,
	throwIfIssues,
} from '../command-validation.js';
import type { DomainId } from '../shared.js';
import {
	ADDITIONAL_PERSONNEL_TARGET_TYPES,
	type AdditionalPersonnelTarget,
	basePayload,
	type FieldWorkCommandInput,
	type FieldWorkCommandPayload,
	type FieldWorkDomainCommand,
	validateBase,
	validateIdCommand,
	validateTarget,
} from './shared.js';

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

export function addAdditionalPersonnelCommand(
	input: AddAdditionalPersonnelCommandInput,
): AddAdditionalPersonnelCommand {
	const issues = createIssues();
	validateBase(input, issues);
	requireUuid(input.additionalPersonnelId, 'additionalPersonnelId', issues);
	requireUuid(input.personnelProfileId, 'personnelProfileId', issues);
	const target = validateTarget(
		input.target,
		ADDITIONAL_PERSONNEL_TARGET_TYPES,
		'target',
		issues,
		requireUuid,
	);
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
	const issues = validateIdCommand(input, 'additionalPersonnelId', requireUuid);
	throwIfIssues('Remove additional personnel command is invalid.', issues);
	return {
		type: 'fieldWork.removeAdditionalPersonnel',
		payload: {
			...basePayload(input),
			additionalPersonnelId: normalizeRequiredId(input.additionalPersonnelId),
		},
	};
}
