import {
	basePayload,
	createIssues,
	jsonObject as normalizeMetadata,
	normalizeNullableText,
	optionalUuid as normalizeOptionalUuid,
	requiredId as normalizeRequiredId,
	requiredText as normalizeRequiredText,
	requiredUuid as requireUuid,
	throwIfIssues,
	validateBase,
	validateIdCommand,
} from '../command-validation.js';
import {
	type HabitatLocationSource,
	type HabitatLocationSourceInput,
	validateLocationSourceInput,
} from '../location-intent.js';
import type { DomainId, JsonObject } from '../shared.js';
import {
	jsonObjectField,
	normalizeUpdateFields,
	nullableReferenceIdField,
	requiredTextField,
	type UpdateFieldSet,
	type UpdateFieldsChanges,
	type UpdateFieldsInput,
	updateFieldsCommand,
} from '../update-command-fields.js';
import type { LarvalCommandInput, LarvalCommandPayload, LarvalDomainCommand } from './shared.js';

export interface CreateHabitatCommandInput extends LarvalCommandInput {
	readonly habitatId: DomainId;
	readonly locationSource: HabitatLocationSourceInput;
	readonly addressId?: DomainId | null;
	readonly habitatTypeId?: DomainId | null;
	readonly habitatName?: string | null;
	readonly description: string;
	readonly metadata?: unknown | null;
}

export interface CreateHabitatCommandPayload extends LarvalCommandPayload {
	readonly habitatId: DomainId;
	readonly locationSource: HabitatLocationSource;
	readonly addressId: DomainId | null;
	readonly habitatTypeId: DomainId | null;
	readonly habitatName: string | null;
	readonly description: string;
	readonly metadata: JsonObject | null;
}

export type CreateHabitatCommand = LarvalDomainCommand<
	'larvalSurveillance.createHabitat',
	CreateHabitatCommandPayload
>;

export interface CreateHabitatFromInspectionCommandInput extends LarvalCommandInput {
	readonly habitatId: DomainId;
	readonly inspectionId: DomainId;
	readonly habitatName?: string | null;
	readonly description: string;
	readonly metadata?: unknown | null;
}

export type CreateHabitatFromInspectionCommand = LarvalDomainCommand<
	'larvalSurveillance.createHabitatFromInspection',
	LarvalCommandPayload & {
		readonly habitatId: DomainId;
		readonly inspectionId: DomainId;
		readonly habitatName: string | null;
		readonly description: string;
		readonly metadata: JsonObject | null;
	}
>;

export const HABITAT_UPDATE_FIELDS = {
	habitatName: normalizeNullableText,
	description: requiredTextField(),
	metadata: jsonObjectField,
} satisfies UpdateFieldSet;

export type UpdateHabitatDetailsCommandInput = LarvalCommandInput &
	UpdateFieldsInput<typeof HABITAT_UPDATE_FIELDS> & {
		readonly habitatId: DomainId;
	};

export type UpdateHabitatDetailsCommand = LarvalDomainCommand<
	'larvalSurveillance.updateHabitatDetails',
	LarvalCommandPayload & {
		readonly habitatId: DomainId;
		readonly changes: UpdateFieldsChanges<typeof HABITAT_UPDATE_FIELDS>;
	}
>;

export interface UpdateHabitatLocationCommandInput extends LarvalCommandInput {
	readonly habitatId: DomainId;
	readonly locationSource: HabitatLocationSourceInput;
	readonly acknowledgedHabitatLocationSemanticsChange?: boolean;
}

export type UpdateHabitatLocationCommand = LarvalDomainCommand<
	'larvalSurveillance.updateHabitatLocation',
	LarvalCommandPayload & {
		readonly habitatId: DomainId;
		readonly locationSource: HabitatLocationSource;
		readonly acknowledgedHabitatLocationSemanticsChange: boolean;
	}
>;

export const HABITAT_CONFIGURATION_UPDATE_FIELDS = {
	addressId: nullableReferenceIdField,
	habitatTypeId: nullableReferenceIdField,
} satisfies UpdateFieldSet;

export type UpdateHabitatConfigurationCommandInput = LarvalCommandInput &
	UpdateFieldsInput<typeof HABITAT_CONFIGURATION_UPDATE_FIELDS> & {
		readonly habitatId: DomainId;
		readonly acknowledgedHabitatConfigurationSemanticsChange?: boolean;
	};

export type UpdateHabitatConfigurationCommand = LarvalDomainCommand<
	'larvalSurveillance.updateHabitatConfiguration',
	LarvalCommandPayload & {
		readonly habitatId: DomainId;
		readonly changes: UpdateFieldsChanges<typeof HABITAT_CONFIGURATION_UPDATE_FIELDS>;
		readonly acknowledgedHabitatConfigurationSemanticsChange: boolean;
	}
>;

export interface HabitatIdCommandInput extends LarvalCommandInput {
	readonly habitatId: DomainId;
}

export type MarkHabitatInaccessibleCommand = LarvalDomainCommand<
	'larvalSurveillance.markHabitatInaccessible',
	LarvalCommandPayload & { readonly habitatId: DomainId }
>;

export type ClearHabitatInaccessibleCommand = LarvalDomainCommand<
	'larvalSurveillance.clearHabitatInaccessible',
	LarvalCommandPayload & { readonly habitatId: DomainId }
>;

export interface RetireHabitatCommandInput extends HabitatIdCommandInput {
	readonly acknowledgedRouteRemoval?: boolean;
}

export type RetireHabitatCommand = LarvalDomainCommand<
	'larvalSurveillance.retireHabitat',
	LarvalCommandPayload & {
		readonly habitatId: DomainId;
		readonly acknowledgedRouteRemoval: boolean;
	}
>;

export type ReactivateHabitatCommand = LarvalDomainCommand<
	'larvalSurveillance.reactivateHabitat',
	LarvalCommandPayload & { readonly habitatId: DomainId }
>;

export interface DeleteHabitatCommandInput extends HabitatIdCommandInput {
	readonly acknowledgedHabitatDelete?: boolean;
	readonly acknowledgedInspectionDetach?: boolean;
	readonly acknowledgedCrossDomainDetach?: boolean;
}

export type DeleteHabitatCommand = LarvalDomainCommand<
	'larvalSurveillance.deleteHabitat',
	LarvalCommandPayload & {
		readonly habitatId: DomainId;
		readonly acknowledgedHabitatDelete: boolean;
		readonly acknowledgedInspectionDetach: boolean;
		readonly acknowledgedCrossDomainDetach: boolean;
	}
>;

export interface MergeHabitatsCommandInput extends LarvalCommandInput {
	readonly targetHabitatId: DomainId;
	readonly sourceHabitatIds: readonly DomainId[];
	readonly acknowledgedMergeConsolidatesHistory?: boolean;
}

export type MergeHabitatsCommand = LarvalDomainCommand<
	'larvalSurveillance.mergeHabitats',
	LarvalCommandPayload & {
		readonly targetHabitatId: DomainId;
		readonly sourceHabitatIds: readonly DomainId[];
		readonly acknowledgedMergeConsolidatesHistory: true;
	}
>;

export function createHabitatCommand(input: CreateHabitatCommandInput): CreateHabitatCommand {
	const issues = createIssues();
	validateBase(input, issues);
	requireUuid(input.habitatId, 'habitatId', issues);
	const locationSource = validateLocationSourceInput(input, 'habitat', issues);
	const addressId = normalizeOptionalUuid(input.addressId, 'addressId', issues);
	const habitatTypeId = normalizeOptionalUuid(input.habitatTypeId, 'habitatTypeId', issues);
	const description = normalizeRequiredText(input.description, 'description', issues);
	const metadata = normalizeMetadata(input.metadata, 'metadata', issues);
	throwIfIssues('Create habitat command is invalid.', issues);

	return {
		type: 'larvalSurveillance.createHabitat',
		payload: {
			...basePayload(input),
			habitatId: normalizeRequiredId(input.habitatId),
			locationSource,
			addressId,
			habitatTypeId,
			habitatName: normalizeNullableText(input.habitatName),
			description,
			metadata,
		},
	};
}

export function createHabitatFromInspectionCommand(
	input: CreateHabitatFromInspectionCommandInput,
): CreateHabitatFromInspectionCommand {
	const issues = createIssues();
	validateBase(input, issues);
	requireUuid(input.habitatId, 'habitatId', issues);
	requireUuid(input.inspectionId, 'inspectionId', issues);
	const description = normalizeRequiredText(input.description, 'description', issues);
	const metadata = normalizeMetadata(input.metadata, 'metadata', issues);
	throwIfIssues('Create habitat from inspection command is invalid.', issues);

	return {
		type: 'larvalSurveillance.createHabitatFromInspection',
		payload: {
			...basePayload(input),
			habitatId: normalizeRequiredId(input.habitatId),
			inspectionId: normalizeRequiredId(input.inspectionId),
			habitatName: normalizeNullableText(input.habitatName),
			description,
			metadata,
		},
	};
}

export function updateHabitatDetailsCommand(
	input: UpdateHabitatDetailsCommandInput,
): UpdateHabitatDetailsCommand {
	return updateFieldsCommand({
		type: 'larvalSurveillance.updateHabitatDetails',
		input,
		idKey: 'habitatId',
		fields: HABITAT_UPDATE_FIELDS,
		changeNoun: 'habitat',
		emptyChangeMessage: 'At least one habitat detail must change.',
		message: 'Update habitat details command is invalid.',
	});
}

export function updateHabitatLocationCommand(
	input: UpdateHabitatLocationCommandInput,
): UpdateHabitatLocationCommand {
	const issues = createIssues();
	validateBase(input, issues);
	requireUuid(input.habitatId, 'habitatId', issues);
	const locationSource = validateLocationSourceInput(input, 'habitat', issues);
	if (input.acknowledgedHabitatLocationSemanticsChange !== true) {
		issues.push({
			path: 'acknowledgedHabitatLocationSemanticsChange',
			message: 'Habitat location changes require acknowledgement.',
		});
	}
	throwIfIssues('Update habitat location command is invalid.', issues);

	return {
		type: 'larvalSurveillance.updateHabitatLocation',
		payload: {
			...basePayload(input),
			habitatId: normalizeRequiredId(input.habitatId),
			locationSource,
			acknowledgedHabitatLocationSemanticsChange: true,
		},
	};
}

export function updateHabitatConfigurationCommand(
	input: UpdateHabitatConfigurationCommandInput,
): UpdateHabitatConfigurationCommand {
	const issues = createIssues();
	validateBase(input, issues);
	requireUuid(input.habitatId, 'habitatId', issues);
	const changes = normalizeUpdateFields(
		input,
		HABITAT_CONFIGURATION_UPDATE_FIELDS,
		'At least one habitat configuration field must change.',
		issues,
	);
	if (input.acknowledgedHabitatConfigurationSemanticsChange !== true) {
		issues.push({
			path: 'acknowledgedHabitatConfigurationSemanticsChange',
			message: 'Habitat configuration changes require acknowledgement.',
		});
	}
	throwIfIssues('Update habitat configuration command is invalid.', issues);

	return {
		type: 'larvalSurveillance.updateHabitatConfiguration',
		payload: {
			...basePayload(input),
			habitatId: normalizeRequiredId(input.habitatId),
			changes,
			acknowledgedHabitatConfigurationSemanticsChange: true,
		},
	};
}

export function markHabitatInaccessibleCommand(
	input: HabitatIdCommandInput,
): MarkHabitatInaccessibleCommand {
	const issues = validateIdCommand(input, 'habitatId');
	throwIfIssues('Mark habitat inaccessible command is invalid.', issues);
	return {
		type: 'larvalSurveillance.markHabitatInaccessible',
		payload: { ...basePayload(input), habitatId: normalizeRequiredId(input.habitatId) },
	};
}

export function clearHabitatInaccessibleCommand(
	input: HabitatIdCommandInput,
): ClearHabitatInaccessibleCommand {
	const issues = validateIdCommand(input, 'habitatId');
	throwIfIssues('Clear habitat inaccessible command is invalid.', issues);
	return {
		type: 'larvalSurveillance.clearHabitatInaccessible',
		payload: { ...basePayload(input), habitatId: normalizeRequiredId(input.habitatId) },
	};
}

export function retireHabitatCommand(input: RetireHabitatCommandInput): RetireHabitatCommand {
	const issues = validateIdCommand(input, 'habitatId');
	throwIfIssues('Retire habitat command is invalid.', issues);
	return {
		type: 'larvalSurveillance.retireHabitat',
		payload: {
			...basePayload(input),
			habitatId: normalizeRequiredId(input.habitatId),
			acknowledgedRouteRemoval: input.acknowledgedRouteRemoval ?? false,
		},
	};
}

export function reactivateHabitatCommand(input: HabitatIdCommandInput): ReactivateHabitatCommand {
	const issues = validateIdCommand(input, 'habitatId');
	throwIfIssues('Reactivate habitat command is invalid.', issues);
	return {
		type: 'larvalSurveillance.reactivateHabitat',
		payload: { ...basePayload(input), habitatId: normalizeRequiredId(input.habitatId) },
	};
}

export function deleteHabitatCommand(input: DeleteHabitatCommandInput): DeleteHabitatCommand {
	const issues = validateIdCommand(input, 'habitatId');
	// Delete means the habitat should never have existed, and Retire means it
	// should not be inspected from now on. The two buttons sit next to each other
	// and only one of them is reversible, so the command carries the caller's
	// answer to which they meant. The other two flags on this payload are about
	// what hangs off the habitat and the delete registry counts those; this one
	// is about the verb, so nothing can count it and the builder is where it
	// belongs.
	if (input.acknowledgedHabitatDelete !== true) {
		issues.push({
			path: 'acknowledgedHabitatDelete',
			message: 'Deleting a habitat is permanent, and requires acknowledgement. Retire it instead.',
		});
	}
	throwIfIssues('Delete habitat command is invalid.', issues);
	return {
		type: 'larvalSurveillance.deleteHabitat',
		payload: {
			...basePayload(input),
			habitatId: normalizeRequiredId(input.habitatId),
			acknowledgedHabitatDelete: input.acknowledgedHabitatDelete ?? false,
			acknowledgedInspectionDetach: input.acknowledgedInspectionDetach ?? false,
			acknowledgedCrossDomainDetach: input.acknowledgedCrossDomainDetach ?? false,
		},
	};
}

export function mergeHabitatsCommand(input: MergeHabitatsCommandInput): MergeHabitatsCommand {
	const issues = createIssues();
	validateBase(input, issues);
	requireUuid(input.targetHabitatId, 'targetHabitatId', issues);
	if (input.sourceHabitatIds.length === 0) {
		issues.push({ path: 'sourceHabitatIds', message: 'At least one source habitat is required.' });
	}
	const normalizedSources = input.sourceHabitatIds.map((id, index) => {
		requireUuid(id, `sourceHabitatIds.${index}`, issues);
		return normalizeRequiredId(id);
	});
	const uniqueSources = new Set(normalizedSources);
	if (uniqueSources.size !== normalizedSources.length) {
		issues.push({ path: 'sourceHabitatIds', message: 'Source habitat IDs must be unique.' });
	}
	if (uniqueSources.has(normalizeRequiredId(input.targetHabitatId))) {
		issues.push({
			path: 'sourceHabitatIds',
			message: 'Source habitat IDs cannot include the target habitat.',
		});
	}
	if (input.acknowledgedMergeConsolidatesHistory !== true) {
		issues.push({
			path: 'acknowledgedMergeConsolidatesHistory',
			message: 'Habitat merge requires acknowledgement.',
		});
	}
	throwIfIssues('Merge habitats command is invalid.', issues);

	return {
		type: 'larvalSurveillance.mergeHabitats',
		payload: {
			...basePayload(input),
			targetHabitatId: normalizeRequiredId(input.targetHabitatId),
			sourceHabitatIds: normalizedSources,
			acknowledgedMergeConsolidatesHistory: true,
		},
	};
}
