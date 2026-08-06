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
import {
	inferLarvalDensity,
	isLarvalDensity,
	type LarvalDensity,
	type LarvalInspectionEntryPolicy,
	resolveLarvalInspectionEntryPolicy,
} from '../organization-settings/index.js';
import type { DomainId, DomainValidationIssue, LocalDateString } from '../shared.js';
import {
	basePayload,
	type LarvalCommandInput,
	type LarvalCommandPayload,
	type LarvalDomainCommand,
	validateAdHocInspectionLocationSourceInput,
	validateBase,
	validateIdCommand,
} from './shared.js';

export interface ImmatureStageFlags {
	readonly hasFirstInstar: boolean;
	readonly hasSecondInstar: boolean;
	readonly hasThirdInstar: boolean;
	readonly hasFourthInstar: boolean;
	readonly hasPupae: boolean;
	readonly hasEggs: boolean;
}

export interface LarvalInspectionResultInput extends Partial<ImmatureStageFlags> {
	readonly isWet: boolean;
	readonly dipCount?: number | null;
	readonly density?: LarvalDensity | null;
	readonly larvaeCount?: number | null;
	readonly policy?: LarvalInspectionEntryPolicy | null;
}

export interface NormalizedLarvalInspectionResult extends ImmatureStageFlags {
	readonly isWet: boolean;
	readonly dipCount: number | null;
	readonly density: LarvalDensity | null;
	readonly larvaeCount: number | null;
	readonly isBreedingPositive: boolean;
}

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

export function normalizeLarvalInspectionResult(
	input: LarvalInspectionResultInput,
): NormalizedLarvalInspectionResult {
	const issues = createIssues();
	const result = normalizeInspectionResult(input, 'result', issues);
	throwIfIssues('Larval inspection result is invalid.', issues);
	return result;
}

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

function normalizeInspectionResult(
	input: LarvalInspectionResultInput,
	path: string,
	issues: DomainValidationIssue[],
): NormalizedLarvalInspectionResult {
	const policy = resolveLarvalInspectionEntryPolicy(input.policy, issues, `${path}.policy`);
	if (typeof input.isWet !== 'boolean') {
		issues.push({ path: `${path}.isWet`, message: 'isWet must be a boolean.' });
	}
	const stageFlags = normalizeStageFlags(input);
	const hasAnyStage = Object.values(stageFlags).some(Boolean);
	const dipCount = normalizeOptionalNonnegativeInteger(input.dipCount, `${path}.dipCount`, issues);
	const larvaeCount = normalizeOptionalNonnegativeInteger(
		input.larvaeCount,
		`${path}.larvaeCount`,
		issues,
	);
	if (dipCount !== null && dipCount <= 0) {
		issues.push({ path: `${path}.dipCount`, message: 'dipCount must be a positive integer.' });
	}
	const density = normalizeDensity(input.density, `${path}.density`, issues);

	if (input.isWet === false) {
		if (dipCount !== null || larvaeCount !== null || density !== null || hasAnyStage) {
			issues.push({
				path,
				message: 'Dry inspections cannot include abundance or life-stage fields.',
			});
		}
		return {
			isWet: false,
			dipCount: null,
			density: null,
			larvaeCount: null,
			isBreedingPositive: false,
			...emptyStageFlags(),
		};
	}

	let normalizedDensity = density;
	switch (policy.mode) {
		case 'density_only':
			if (density === null) {
				issues.push({
					path: `${path}.density`,
					message: 'density is required for density-only entry.',
				});
			}
			if (larvaeCount !== null) {
				issues.push({
					path: `${path}.larvaeCount`,
					message: 'larvaeCount is not allowed for density-only entry.',
				});
			}
			break;
		case 'count_and_dips_required':
			if (larvaeCount === null) {
				issues.push({
					path: `${path}.larvaeCount`,
					message: 'larvaeCount is required for count-and-dips entry.',
				});
			}
			if (dipCount === null) {
				issues.push({
					path: `${path}.dipCount`,
					message: 'dipCount is required for count-and-dips entry.',
				});
			}
			break;
		case 'hybrid':
			if (density === null && (larvaeCount === null || dipCount === null)) {
				issues.push({
					path,
					message: 'Wet inspections require density or larvaeCount with dipCount.',
				});
			}
			break;
	}

	if (larvaeCount !== null && dipCount === null) {
		issues.push({
			path: `${path}.dipCount`,
			message: 'dipCount is required when larvaeCount is provided.',
		});
	}

	if (larvaeCount !== null && density !== null) {
		if (density === 'none' && larvaeCount > 0) {
			issues.push({
				path: `${path}.density`,
				message: "density cannot be 'none' when larvaeCount is greater than zero.",
			});
		}
		if (density !== 'none' && larvaeCount === 0) {
			issues.push({
				path: `${path}.density`,
				message: "density must be 'none' when larvaeCount is zero.",
			});
		}
	}

	if (policy.densityRanges !== null && larvaeCount !== null && dipCount !== null) {
		normalizedDensity = inferLarvalDensity(
			larvaeCount,
			dipCount,
			policy.densityRanges,
			path,
			issues,
		);
		if (density !== null && normalizedDensity !== null && density !== normalizedDensity) {
			issues.push({
				path: `${path}.density`,
				message: 'density must match the configured larvae-per-dip range.',
			});
		}
	}

	const isBreedingPositive =
		normalizedDensity !== null && normalizedDensity !== 'none'
			? true
			: larvaeCount !== null && larvaeCount > 0;

	if (isBreedingPositive && !hasAnyStage) {
		issues.push({
			path,
			message: 'Breeding-positive inspections require at least one life-stage flag.',
		});
	}
	if (!isBreedingPositive && hasAnyStage) {
		issues.push({
			path,
			message: 'Life-stage flags require breeding-positive density or larvaeCount.',
		});
	}

	return {
		isWet: input.isWet,
		dipCount,
		density: normalizedDensity,
		larvaeCount,
		isBreedingPositive,
		...stageFlags,
	};
}

function normalizeOptionalNonnegativeInteger(
	value: number | null | undefined,
	path: string,
	issues: DomainValidationIssue[],
): number | null {
	if (value === undefined || value === null) {
		return null;
	}
	if (!Number.isInteger(value) || value < 0) {
		issues.push({ path, message: `${path} must be a nonnegative integer.` });
		return null;
	}
	return value;
}

function normalizeDensity(
	value: LarvalDensity | null | undefined,
	path: string,
	issues: DomainValidationIssue[],
): LarvalDensity | null {
	if (value === undefined || value === null) {
		return null;
	}
	if (!isLarvalDensity(value)) {
		issues.push({ path, message: `${path} is not a supported larval density.` });
		return null;
	}
	return value;
}

function normalizeStageFlags(input: Partial<ImmatureStageFlags>): ImmatureStageFlags {
	return {
		hasFirstInstar: input.hasFirstInstar ?? false,
		hasSecondInstar: input.hasSecondInstar ?? false,
		hasThirdInstar: input.hasThirdInstar ?? false,
		hasFourthInstar: input.hasFourthInstar ?? false,
		hasPupae: input.hasPupae ?? false,
		hasEggs: input.hasEggs ?? false,
	};
}

function emptyStageFlags(): ImmatureStageFlags {
	return {
		hasFirstInstar: false,
		hasSecondInstar: false,
		hasThirdInstar: false,
		hasFourthInstar: false,
		hasPupae: false,
		hasEggs: false,
	};
}
