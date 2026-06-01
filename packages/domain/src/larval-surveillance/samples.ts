import {
	createIssues,
	requiredId as normalizeRequiredId,
	requiredText as normalizeRequiredText,
	throwIfIssues,
} from '../command-validation.js';
import type { DomainId } from '../shared.js';
import {
	basePayload,
	type LarvalCommandInput,
	type LarvalCommandPayload,
	type LarvalDomainCommand,
	normalizeNullableText,
	validateIdCommand,
	validateSampleBase,
} from './shared.js';

export interface AddInspectionSampleCommandInput extends LarvalCommandInput {
	readonly sampleId: DomainId;
	readonly inspectionId: DomainId;
	readonly displayName: string;
}

export type AddInspectionSampleCommand = LarvalDomainCommand<
	'larvalSurveillance.addInspectionSample',
	LarvalCommandPayload & {
		readonly sampleId: DomainId;
		readonly inspectionId: DomainId;
		readonly displayName: string;
	}
>;

export interface AddUnlabeledInspectionSampleCommandInput extends LarvalCommandInput {
	readonly sampleId: DomainId;
	readonly inspectionId: DomainId;
}

export type AddUnlabeledInspectionSampleCommand = LarvalDomainCommand<
	'larvalSurveillance.addUnlabeledInspectionSample',
	LarvalCommandPayload & {
		readonly sampleId: DomainId;
		readonly inspectionId: DomainId;
	}
>;

export interface UpdateInspectionSampleCommandInput extends LarvalCommandInput {
	readonly sampleId: DomainId;
	readonly displayName?: string;
}

export type UpdateInspectionSampleCommand = LarvalDomainCommand<
	'larvalSurveillance.updateInspectionSample',
	LarvalCommandPayload & {
		readonly sampleId: DomainId;
		readonly changes: Readonly<{ readonly displayName?: string }>;
	}
>;

export interface DeleteInspectionSampleCommandInput extends LarvalCommandInput {
	readonly sampleId: DomainId;
	readonly acknowledgedAssociatedRecordsDeletion?: boolean;
}

export type DeleteInspectionSampleCommand = LarvalDomainCommand<
	'larvalSurveillance.deleteInspectionSample',
	LarvalCommandPayload & {
		readonly sampleId: DomainId;
		readonly acknowledgedAssociatedRecordsDeletion: boolean;
	}
>;

export interface SampleIdCommandInput extends LarvalCommandInput {
	readonly sampleId: DomainId;
}

export type MarkSampleZeroLarvaeCommand = LarvalDomainCommand<
	'larvalSurveillance.markSampleZeroLarvae',
	LarvalCommandPayload & { readonly sampleId: DomainId }
>;

export type ClearSampleZeroLarvaeCommand = LarvalDomainCommand<
	'larvalSurveillance.clearSampleZeroLarvae',
	LarvalCommandPayload & { readonly sampleId: DomainId }
>;

export interface SetSampleNonMosquitoPresenceCommandInput extends SampleIdCommandInput {
	readonly hasNonMosquito: boolean;
}

export type SetSampleNonMosquitoPresenceCommand = LarvalDomainCommand<
	'larvalSurveillance.setSampleNonMosquitoPresence',
	LarvalCommandPayload & {
		readonly sampleId: DomainId;
		readonly hasNonMosquito: boolean;
	}
>;

export interface SetSampleUnidentifiableReasonCommandInput extends SampleIdCommandInput {
	readonly unidentifiableReason: string | null;
}

export type SetSampleUnidentifiableReasonCommand = LarvalDomainCommand<
	'larvalSurveillance.setSampleUnidentifiableReason',
	LarvalCommandPayload & {
		readonly sampleId: DomainId;
		readonly unidentifiableReason: string | null;
	}
>;

export function addInspectionSampleCommand(
	input: AddInspectionSampleCommandInput,
): AddInspectionSampleCommand {
	const issues = validateSampleBase(input);
	const displayName = normalizeRequiredText(input.displayName, 'displayName', issues);
	throwIfIssues('Add inspection sample command is invalid.', issues);
	return {
		type: 'larvalSurveillance.addInspectionSample',
		payload: {
			...basePayload(input),
			sampleId: normalizeRequiredId(input.sampleId),
			inspectionId: normalizeRequiredId(input.inspectionId),
			displayName,
		},
	};
}

export function addUnlabeledInspectionSampleCommand(
	input: AddUnlabeledInspectionSampleCommandInput,
): AddUnlabeledInspectionSampleCommand {
	const issues = validateSampleBase(input);
	throwIfIssues('Add unlabeled inspection sample command is invalid.', issues);
	return {
		type: 'larvalSurveillance.addUnlabeledInspectionSample',
		payload: {
			...basePayload(input),
			sampleId: normalizeRequiredId(input.sampleId),
			inspectionId: normalizeRequiredId(input.inspectionId),
		},
	};
}

export function updateInspectionSampleCommand(
	input: UpdateInspectionSampleCommandInput,
): UpdateInspectionSampleCommand {
	const issues = createIssues();
	const idIssues = validateIdCommand(input, 'sampleId');
	issues.push(...idIssues);
	const hasDisplayName = input.displayName !== undefined;
	if (!hasDisplayName) {
		issues.push({ path: 'changes', message: 'At least one sample field must change.' });
	}
	const displayName = hasDisplayName
		? normalizeRequiredText(input.displayName, 'displayName', issues)
		: undefined;
	throwIfIssues('Update inspection sample command is invalid.', issues);

	return {
		type: 'larvalSurveillance.updateInspectionSample',
		payload: {
			...basePayload(input),
			sampleId: normalizeRequiredId(input.sampleId),
			changes: {
				...(displayName !== undefined ? { displayName } : {}),
			},
		},
	};
}

export function deleteInspectionSampleCommand(
	input: DeleteInspectionSampleCommandInput,
): DeleteInspectionSampleCommand {
	const issues = validateIdCommand(input, 'sampleId');
	throwIfIssues('Delete inspection sample command is invalid.', issues);
	return {
		type: 'larvalSurveillance.deleteInspectionSample',
		payload: {
			...basePayload(input),
			sampleId: normalizeRequiredId(input.sampleId),
			acknowledgedAssociatedRecordsDeletion: input.acknowledgedAssociatedRecordsDeletion ?? false,
		},
	};
}

export function markSampleZeroLarvaeCommand(
	input: SampleIdCommandInput,
): MarkSampleZeroLarvaeCommand {
	const issues = validateIdCommand(input, 'sampleId');
	throwIfIssues('Mark sample zero larvae command is invalid.', issues);
	return {
		type: 'larvalSurveillance.markSampleZeroLarvae',
		payload: { ...basePayload(input), sampleId: normalizeRequiredId(input.sampleId) },
	};
}

export function clearSampleZeroLarvaeCommand(
	input: SampleIdCommandInput,
): ClearSampleZeroLarvaeCommand {
	const issues = validateIdCommand(input, 'sampleId');
	throwIfIssues('Clear sample zero larvae command is invalid.', issues);
	return {
		type: 'larvalSurveillance.clearSampleZeroLarvae',
		payload: { ...basePayload(input), sampleId: normalizeRequiredId(input.sampleId) },
	};
}

export function setSampleNonMosquitoPresenceCommand(
	input: SetSampleNonMosquitoPresenceCommandInput,
): SetSampleNonMosquitoPresenceCommand {
	const issues = validateIdCommand(input, 'sampleId');
	if (typeof input.hasNonMosquito !== 'boolean') {
		issues.push({ path: 'hasNonMosquito', message: 'hasNonMosquito must be a boolean.' });
	}
	throwIfIssues('Set sample non-mosquito presence command is invalid.', issues);
	return {
		type: 'larvalSurveillance.setSampleNonMosquitoPresence',
		payload: {
			...basePayload(input),
			sampleId: normalizeRequiredId(input.sampleId),
			hasNonMosquito: input.hasNonMosquito,
		},
	};
}

export function setSampleUnidentifiableReasonCommand(
	input: SetSampleUnidentifiableReasonCommandInput,
): SetSampleUnidentifiableReasonCommand {
	const issues = validateIdCommand(input, 'sampleId');
	const unidentifiableReason = normalizeNullableText(input.unidentifiableReason);
	if (input.unidentifiableReason !== null && unidentifiableReason === null) {
		issues.push({
			path: 'unidentifiableReason',
			message: 'unidentifiableReason must be non-empty text or null.',
		});
	}
	throwIfIssues('Set sample unidentifiable reason command is invalid.', issues);
	return {
		type: 'larvalSurveillance.setSampleUnidentifiableReason',
		payload: {
			...basePayload(input),
			sampleId: normalizeRequiredId(input.sampleId),
			unidentifiableReason,
		},
	};
}
