import {
	basePayload,
	createIssues,
	normalizeNullableText,
	optionalUuid as normalizeOptionalUuid,
	requiredId as normalizeRequiredId,
	requiredUuid as requireUuid,
	throwIfIssues,
	validateBase,
	validateIdCommand,
} from '../command-validation.js';
import type { TrapLocationSource } from '../location-intent.js';
import type { DomainId } from '../shared.js';
import {
	normalizeUpdateFields,
	nullableReferenceIdField,
	referenceIdField,
	type UpdateFieldSet,
	type UpdateFieldsChanges,
	type UpdateFieldsInput,
} from '../update-command-fields.js';
import {
	type AdultCommandInput,
	type AdultCommandPayload,
	type DomainCommand,
	trapLocationSourceField,
	validateTrapDisplay,
	validateTrapLocationSourceInput,
} from './shared.js';

export interface CreateTrapCommandInput extends AdultCommandInput {
	readonly trapId: DomainId;
	readonly locationSource: import('../location-intent.js').TrapLocationSourceInput;
	readonly collectionMethodId: DomainId;
	readonly addressId?: DomainId | null;
	readonly collectionLureId?: DomainId | null;
	readonly trapName?: string | null;
	readonly trapCode?: string | null;
	readonly description?: string | null;
	readonly acknowledgedDuplicateTrapCode?: boolean;
}

export interface CreateTrapCommandPayload extends AdultCommandPayload {
	readonly trapId: DomainId;
	readonly locationSource: TrapLocationSource;
	readonly collectionMethodId: DomainId;
	readonly addressId: DomainId | null;
	readonly collectionLureId: DomainId | null;
	readonly trapName: string | null;
	readonly trapCode: string | null;
	readonly description: string | null;
	readonly acknowledgedDuplicateTrapCode: boolean;
}

export type CreateTrapCommand = DomainCommand<
	'adultSurveillance.createTrap',
	CreateTrapCommandPayload
>;

export const TRAP_DETAILS_UPDATE_FIELDS = {
	trapName: normalizeNullableText,
	trapCode: normalizeNullableText,
	description: normalizeNullableText,
} satisfies UpdateFieldSet;

export type UpdateTrapDetailsCommandInput = AdultCommandInput &
	UpdateFieldsInput<typeof TRAP_DETAILS_UPDATE_FIELDS> & {
		readonly trapId: DomainId;
		readonly acknowledgedHistoricalLabelChange?: boolean;
	};

export interface UpdateTrapDetailsCommandPayload extends AdultCommandPayload {
	readonly trapId: DomainId;
	readonly changes: UpdateFieldsChanges<typeof TRAP_DETAILS_UPDATE_FIELDS>;
	readonly acknowledgedHistoricalLabelChange: boolean;
}

export type UpdateTrapDetailsCommand = DomainCommand<
	'adultSurveillance.updateTrapDetails',
	UpdateTrapDetailsCommandPayload
>;

export const TRAP_CONFIGURATION_UPDATE_FIELDS = {
	locationSource: trapLocationSourceField,
	collectionMethodId: referenceIdField,
	addressId: nullableReferenceIdField,
	collectionLureId: nullableReferenceIdField,
} satisfies UpdateFieldSet;

export type UpdateTrapConfigurationCommandInput = AdultCommandInput &
	UpdateFieldsInput<typeof TRAP_CONFIGURATION_UPDATE_FIELDS> & {
		readonly trapId: DomainId;
		readonly acknowledgedTrapLocationSemanticsChange?: boolean;
		readonly acknowledgedTrapMethodSemanticsChange?: boolean;
	};

export interface UpdateTrapConfigurationCommandPayload extends AdultCommandPayload {
	readonly trapId: DomainId;
	readonly changes: UpdateFieldsChanges<typeof TRAP_CONFIGURATION_UPDATE_FIELDS>;
	readonly acknowledgedTrapLocationSemanticsChange: boolean;
	readonly acknowledgedTrapMethodSemanticsChange: boolean;
}

export type UpdateTrapConfigurationCommand = DomainCommand<
	'adultSurveillance.updateTrapConfiguration',
	UpdateTrapConfigurationCommandPayload
>;

export interface RetireTrapCommandInput extends AdultCommandInput {
	readonly trapId: DomainId;
}

export type RetireTrapCommand = DomainCommand<
	'adultSurveillance.retireTrap',
	AdultCommandPayload & { readonly trapId: DomainId }
>;

export interface ReactivateTrapCommandInput extends AdultCommandInput {
	readonly trapId: DomainId;
	readonly acknowledgedDuplicateTrapCode?: boolean;
}

export type ReactivateTrapCommand = DomainCommand<
	'adultSurveillance.reactivateTrap',
	AdultCommandPayload & {
		readonly trapId: DomainId;
		readonly acknowledgedDuplicateTrapCode: boolean;
	}
>;

export interface DeleteTrapCommandInput extends AdultCommandInput {
	readonly trapId: DomainId;
	readonly acknowledgedCascadeDelete?: boolean;
}

export type DeleteTrapCommand = DomainCommand<
	'adultSurveillance.deleteTrap',
	AdultCommandPayload & {
		readonly trapId: DomainId;
		readonly acknowledgedCascadeDelete: boolean;
	}
>;

export function createTrapCommand(input: CreateTrapCommandInput): CreateTrapCommand {
	const issues = createIssues();
	validateBase(input, issues);
	requireUuid(input.trapId, 'trapId', issues);
	const locationSource = validateTrapLocationSourceInput(input, issues);
	requireUuid(input.collectionMethodId, 'collectionMethodId', issues);

	const trapName = normalizeNullableText(input.trapName);
	const trapCode = normalizeNullableText(input.trapCode);
	const addressId = normalizeOptionalUuid(input.addressId, 'addressId', issues);
	const collectionLureId = normalizeOptionalUuid(
		input.collectionLureId,
		'collectionLureId',
		issues,
	);
	validateTrapDisplay(trapName, trapCode, issues);
	throwIfIssues('Create trap command is invalid.', issues);

	return {
		type: 'adultSurveillance.createTrap',
		payload: {
			organizationId: normalizeRequiredId(input.organizationId),
			actorProfileId: normalizeRequiredId(input.actorProfileId),
			trapId: normalizeRequiredId(input.trapId),
			locationSource,
			collectionMethodId: normalizeRequiredId(input.collectionMethodId),
			addressId,
			collectionLureId,
			trapName,
			trapCode,
			description: normalizeNullableText(input.description),
			acknowledgedDuplicateTrapCode: input.acknowledgedDuplicateTrapCode ?? false,
		},
	};
}

export function updateTrapDetailsCommand(
	input: UpdateTrapDetailsCommandInput,
): UpdateTrapDetailsCommand {
	const issues = createIssues();
	validateBase(input, issues);
	requireUuid(input.trapId, 'trapId', issues);
	const changes = normalizeUpdateFields(
		input,
		TRAP_DETAILS_UPDATE_FIELDS,
		'At least one trap detail must change.',
		issues,
	);
	if (changes.trapName !== undefined && changes.trapCode !== undefined) {
		validateTrapDisplay(changes.trapName, changes.trapCode, issues);
	}
	throwIfIssues('Update trap details command is invalid.', issues);

	return {
		type: 'adultSurveillance.updateTrapDetails',
		payload: {
			...basePayload(input),
			trapId: normalizeRequiredId(input.trapId),
			changes,
			acknowledgedHistoricalLabelChange: input.acknowledgedHistoricalLabelChange ?? false,
		},
	};
}

export function updateTrapConfigurationCommand(
	input: UpdateTrapConfigurationCommandInput,
): UpdateTrapConfigurationCommand {
	const issues = createIssues();
	validateBase(input, issues);
	requireUuid(input.trapId, 'trapId', issues);
	const changes = normalizeUpdateFields(
		input,
		TRAP_CONFIGURATION_UPDATE_FIELDS,
		'At least one trap configuration field must change.',
		issues,
	);
	if (
		changes.locationSource !== undefined &&
		input.acknowledgedTrapLocationSemanticsChange !== true
	) {
		issues.push({
			path: 'acknowledgedTrapLocationSemanticsChange',
			message: 'Changing trap location requires semantic-change acknowledgement.',
		});
	}
	if (
		changes.collectionMethodId !== undefined &&
		input.acknowledgedTrapMethodSemanticsChange !== true
	) {
		issues.push({
			path: 'acknowledgedTrapMethodSemanticsChange',
			message: 'Changing trap method requires semantic-change acknowledgement.',
		});
	}
	throwIfIssues('Update trap configuration command is invalid.', issues);

	return {
		type: 'adultSurveillance.updateTrapConfiguration',
		payload: {
			...basePayload(input),
			trapId: normalizeRequiredId(input.trapId),
			changes,
			acknowledgedTrapLocationSemanticsChange:
				input.acknowledgedTrapLocationSemanticsChange ?? false,
			acknowledgedTrapMethodSemanticsChange: input.acknowledgedTrapMethodSemanticsChange ?? false,
		},
	};
}

export function retireTrapCommand(input: RetireTrapCommandInput): RetireTrapCommand {
	const issues = validateIdCommand(input, 'trapId');
	throwIfIssues('Retire trap command is invalid.', issues);
	return {
		type: 'adultSurveillance.retireTrap',
		payload: { ...basePayload(input), trapId: normalizeRequiredId(input.trapId) },
	};
}

export function reactivateTrapCommand(input: ReactivateTrapCommandInput): ReactivateTrapCommand {
	const issues = validateIdCommand(input, 'trapId');
	throwIfIssues('Reactivate trap command is invalid.', issues);
	return {
		type: 'adultSurveillance.reactivateTrap',
		payload: {
			...basePayload(input),
			trapId: normalizeRequiredId(input.trapId),
			acknowledgedDuplicateTrapCode: input.acknowledgedDuplicateTrapCode ?? false,
		},
	};
}

export function deleteTrapCommand(input: DeleteTrapCommandInput): DeleteTrapCommand {
	const issues = validateIdCommand(input, 'trapId');
	throwIfIssues('Delete trap command is invalid.', issues);
	return {
		type: 'adultSurveillance.deleteTrap',
		payload: {
			...basePayload(input),
			trapId: normalizeRequiredId(input.trapId),
			acknowledgedCascadeDelete: input.acknowledgedCascadeDelete ?? false,
		},
	};
}
