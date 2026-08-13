import {
	createIssues,
	actorDefaultProfileId as normalizeActorDefaultProfileId,
	optionalUuid as normalizeOptionalUuid,
	requiredId as normalizeRequiredId,
	requiredUuid as requireUuid,
	throwIfIssues,
	validateNotFutureLocalDate,
} from '../command-validation.js';
import type {
	AdHocInspectionLocationSource,
	AdHocInspectionLocationSourceInput,
} from '../location-intent.js';
import type { DomainId, DomainValidationIssue, LocalDateString } from '../shared.js';
import {
	type LarvalInspectionResultInput,
	type NormalizedLarvalInspectionResult,
	normalizeInspectionResult,
	normalizeLarvalInspectionResult,
} from '../surveillance-records.js';
import {
	basePayload,
	type LarvalCommandInput,
	type LarvalCommandPayload,
	type LarvalDomainCommand,
	validateAdHocInspectionLocationSourceInput,
	validateBase,
	validateIdCommand,
} from './shared.js';

export type {
	ImmatureStageFlags,
	LarvalInspectionResultInput,
	NormalizedLarvalInspectionResult,
} from '../surveillance-records.js';
export { normalizeLarvalInspectionResult } from '../surveillance-records.js';

export interface InspectionResultCommandInput
	extends LarvalCommandInput,
		LarvalInspectionResultInput {
	readonly inspectionId: DomainId;
	readonly inspectionDate: LocalDateString;
	readonly inspectedByProfileId?: DomainId | null;
}

export interface RecordHabitatInspectionCommandInput extends InspectionResultCommandInput {
	readonly habitatId: DomainId;
}

export interface RecordAdHocInspectionCommandInput extends InspectionResultCommandInput {
	readonly locationSource: AdHocInspectionLocationSourceInput;
	readonly addressId?: DomainId | null;
	readonly habitatTypeId?: DomainId | null;
}

export interface InspectionResultPayload
	extends LarvalCommandPayload,
		NormalizedLarvalInspectionResult {
	readonly inspectionId: DomainId;
	readonly inspectionDate: LocalDateString;
	readonly inspectedByProfileId: DomainId;
}

export type RecordHabitatInspectionCommand = LarvalDomainCommand<
	'larvalSurveillance.recordHabitatInspection',
	InspectionResultPayload & { readonly habitatId: DomainId }
>;

export type RecordAdHocInspectionCommand = LarvalDomainCommand<
	'larvalSurveillance.recordAdHocInspection',
	InspectionResultPayload & {
		readonly locationSource: AdHocInspectionLocationSource;
		readonly addressId: DomainId | null;
		readonly habitatTypeId: DomainId | null;
	}
>;

export type UpdateInspectionFieldDetailsCommand = LarvalDomainCommand<
	'larvalSurveillance.updateInspectionFieldDetails',
	InspectionResultPayload
>;

export interface UpdateAdHocInspectionLocationCommandInput extends LarvalCommandInput {
	readonly inspectionId: DomainId;
	readonly locationSource?: AdHocInspectionLocationSourceInput;
	readonly addressId?: DomainId | null;
	readonly habitatTypeId?: DomainId | null;
}

export type UpdateAdHocInspectionLocationCommand = LarvalDomainCommand<
	'larvalSurveillance.updateAdHocInspectionLocation',
	LarvalCommandPayload & {
		readonly inspectionId: DomainId;
		readonly changes: Readonly<{
			readonly locationSource?: AdHocInspectionLocationSource;
			readonly addressId?: DomainId | null;
			readonly habitatTypeId?: DomainId | null;
		}>;
	}
>;

export interface DeleteInspectionCommandInput extends LarvalCommandInput {
	readonly inspectionId: DomainId;
	readonly acknowledgedAssociatedRecordsDeletion?: boolean;
	readonly acknowledgedCrossDomainDetach?: boolean;
}

export type DeleteInspectionCommand = LarvalDomainCommand<
	'larvalSurveillance.deleteInspection',
	LarvalCommandPayload & {
		readonly inspectionId: DomainId;
		readonly acknowledgedAssociatedRecordsDeletion: boolean;
		readonly acknowledgedCrossDomainDetach: boolean;
	}
>;

export function recordHabitatInspectionCommand(
	input: RecordHabitatInspectionCommandInput,
): RecordHabitatInspectionCommand {
	const issues = validateInspectionBase(input);
	requireUuid(input.habitatId, 'habitatId', issues);
	throwIfIssues('Record habitat inspection command is invalid.', issues);

	return {
		type: 'larvalSurveillance.recordHabitatInspection',
		payload: {
			...inspectionPayload(input),
			habitatId: normalizeRequiredId(input.habitatId),
		},
	};
}

export function recordAdHocInspectionCommand(
	input: RecordAdHocInspectionCommandInput,
): RecordAdHocInspectionCommand {
	const issues = validateInspectionBase(input);
	const locationSource = validateAdHocInspectionLocationSourceInput(input, issues);
	const addressId = normalizeOptionalUuid(input.addressId, 'addressId', issues);
	const habitatTypeId = normalizeOptionalUuid(input.habitatTypeId, 'habitatTypeId', issues);
	throwIfIssues('Record ad hoc inspection command is invalid.', issues);

	return {
		type: 'larvalSurveillance.recordAdHocInspection',
		payload: {
			...inspectionPayload(input),
			locationSource,
			addressId,
			habitatTypeId,
		},
	};
}

export function updateInspectionFieldDetailsCommand(
	input: InspectionResultCommandInput,
): UpdateInspectionFieldDetailsCommand {
	const issues = validateInspectionBase(input);
	throwIfIssues('Update inspection field details command is invalid.', issues);

	return {
		type: 'larvalSurveillance.updateInspectionFieldDetails',
		payload: inspectionPayload(input),
	};
}

export function updateAdHocInspectionLocationCommand(
	input: UpdateAdHocInspectionLocationCommandInput,
): UpdateAdHocInspectionLocationCommand {
	const issues = createIssues();
	validateBase(input, issues);
	requireUuid(input.inspectionId, 'inspectionId', issues);
	const hasLocation = input.locationSource !== undefined;
	const hasAddress = input.addressId !== undefined;
	const hasType = input.habitatTypeId !== undefined;
	if (!hasLocation && !hasAddress && !hasType) {
		issues.push({
			path: 'changes',
			message: 'At least one ad hoc inspection location field must change.',
		});
	}
	const locationSource = hasLocation
		? validateAdHocInspectionLocationSourceInput(input, issues)
		: undefined;
	const addressId = hasAddress
		? normalizeOptionalUuid(input.addressId, 'addressId', issues)
		: undefined;
	const habitatTypeId = hasType
		? normalizeOptionalUuid(input.habitatTypeId, 'habitatTypeId', issues)
		: undefined;
	throwIfIssues('Update ad hoc inspection location command is invalid.', issues);
	const changes: UpdateAdHocInspectionLocationCommand['payload']['changes'] = {
		...(locationSource !== undefined ? { locationSource } : {}),
		...(hasAddress ? { addressId: addressId ?? null } : {}),
		...(hasType ? { habitatTypeId: habitatTypeId ?? null } : {}),
	};

	return {
		type: 'larvalSurveillance.updateAdHocInspectionLocation',
		payload: {
			...basePayload(input),
			inspectionId: normalizeRequiredId(input.inspectionId),
			changes,
		},
	};
}

export function deleteInspectionCommand(
	input: DeleteInspectionCommandInput,
): DeleteInspectionCommand {
	const issues = validateIdCommand(input, 'inspectionId');
	throwIfIssues('Delete inspection command is invalid.', issues);
	return {
		type: 'larvalSurveillance.deleteInspection',
		payload: {
			...basePayload(input),
			inspectionId: normalizeRequiredId(input.inspectionId),
			acknowledgedAssociatedRecordsDeletion: input.acknowledgedAssociatedRecordsDeletion ?? false,
			acknowledgedCrossDomainDetach: input.acknowledgedCrossDomainDetach ?? false,
		},
	};
}

function validateInspectionBase(input: InspectionResultCommandInput): DomainValidationIssue[] {
	const issues = createIssues();
	validateBase(input, issues);
	requireUuid(input.inspectionId, 'inspectionId', issues);
	validateNotFutureLocalDate(input.inspectionDate, 'inspectionDate', issues);
	normalizeOptionalUuid(input.inspectedByProfileId, 'inspectedByProfileId', issues);
	normalizeInspectionResult(input, 'result', issues);
	return issues;
}

function inspectionPayload(input: InspectionResultCommandInput): InspectionResultPayload {
	return {
		...basePayload(input),
		inspectionId: normalizeRequiredId(input.inspectionId),
		inspectionDate: input.inspectionDate,
		inspectedByProfileId: normalizeActorDefaultProfileId(
			input.inspectedByProfileId,
			input.actorProfileId,
		),
		...normalizeLarvalInspectionResult(input),
	};
}
