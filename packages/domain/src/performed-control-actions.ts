import {
	actorDefaultProfileId,
	nullableText,
	optionalId,
	optionalUuid,
	requiredId,
	requiredUuid,
	validateLocalDate,
} from './command-validation.js';
import type { DomainId, DomainValidationIssue, LocalDateString } from './shared.js';

export type ControlType = 'application' | 'source_reduction' | 'biocontrol' | 'outreach';
export type PerformedControlActionKind =
	| 'chemicalApplication'
	| 'sourceReduction'
	| 'outreach'
	| 'biocontrol';

export type ControlActionContext =
	| { readonly kind: 'none' }
	| {
			readonly kind: 'larval';
			readonly habitatId?: DomainId;
			readonly inspectionId?: DomainId;
	  }
	| { readonly kind: 'adult'; readonly collectionId: DomainId };

export interface ApplicationBatchInput {
	readonly applicationBatchId: DomainId;
	readonly insecticideBatchId: DomainId;
}

export interface NormalizedChemicalApplicationFields {
	readonly insecticideId: DomainId;
	readonly amountApplied: number;
	readonly applicationUnitId: DomainId;
	readonly applicationDate: LocalDateString;
	readonly applicatorProfileId: DomainId;
	readonly applicationMethodId: DomainId | null;
	readonly vehicleId: DomainId | null;
	readonly equipmentId: DomainId | null;
	readonly applicationBatches: readonly ApplicationBatchInput[];
}

export interface NormalizedSourceReductionFields {
	readonly sourceReductionDate: LocalDateString;
	readonly sourcesEliminatedAmount: number;
	readonly sourcesEliminatedUnitId: DomainId;
	readonly sourceReductionMethodId: DomainId | null;
	readonly technicianProfileId: DomainId;
}

export interface NormalizedOutreachFields {
	readonly outreachDate: LocalDateString;
	readonly reach: number;
	readonly outreachMethodId: DomainId | null;
	readonly technicianProfileId: DomainId;
	readonly reachDescription: string | null;
}

export interface NormalizedBiocontrolFields {
	readonly biocontrolDate: LocalDateString;
	readonly amountReleased: number;
	readonly releaseUnitId: DomainId;
	readonly biocontrolMethodId: DomainId | null;
	readonly technicianProfileId: DomainId;
}

// These normalizers accumulate issues and return fallback field values for error paths.
// Callers must throw on collected issues before treating returned fields as valid payload data.
export function normalizeChemicalApplicationFields(
	input: {
		readonly actorProfileId: DomainId;
		readonly insecticideId: DomainId;
		readonly amountApplied: number | undefined;
		readonly applicationUnitId: DomainId;
		readonly applicationDate: LocalDateString | undefined;
		readonly applicatorProfileId?: DomainId | null;
		readonly applicationMethodId?: DomainId | null;
		readonly vehicleId?: DomainId | null;
		readonly equipmentId?: DomainId | null;
		readonly applicationBatches?: readonly ApplicationBatchInput[];
	},
	issues: DomainValidationIssue[],
): NormalizedChemicalApplicationFields {
	requiredUuid(input.insecticideId, 'insecticideId', issues);
	requiredUuid(input.applicationUnitId, 'applicationUnitId', issues);
	validateLocalDate(input.applicationDate, 'applicationDate', issues);
	return {
		insecticideId: requiredId(input.insecticideId),
		amountApplied: positiveFiniteNumber(input.amountApplied, 'amountApplied', issues),
		applicationUnitId: requiredId(input.applicationUnitId),
		applicationDate: input.applicationDate ?? '',
		applicatorProfileId: actorDefaultProfileId(input.applicatorProfileId, input.actorProfileId),
		applicationMethodId: optionalUuid(input.applicationMethodId, 'applicationMethodId', issues),
		vehicleId: optionalUuid(input.vehicleId, 'vehicleId', issues),
		equipmentId: optionalUuid(input.equipmentId, 'equipmentId', issues),
		applicationBatches: normalizeApplicationBatches(input.applicationBatches ?? [], issues),
	};
}

export function normalizeMissionChemicalApplicationFields(
	input: {
		readonly actorProfileId: DomainId;
		readonly insecticideId: DomainId;
		readonly amountApplied: number | undefined;
		readonly applicationUnitId: DomainId;
		readonly applicationDate: LocalDateString | undefined;
		readonly applicatorProfileId?: DomainId | null;
		readonly applicationMethodId?: DomainId | null;
		readonly vehicleId?: DomainId | null;
		readonly equipmentId?: DomainId | null;
		readonly applicationBatches?: readonly ApplicationBatchInput[];
	},
	issues: DomainValidationIssue[],
): NormalizedChemicalApplicationFields {
	requiredUuid(input.insecticideId, 'insecticideId', issues);
	requiredUuid(input.applicationUnitId, 'applicationUnitId', issues);
	validateLocalDate(input.applicationDate, 'applicationDate', issues);
	return {
		insecticideId: requiredId(input.insecticideId),
		amountApplied: positiveFiniteNumber(input.amountApplied, 'amountApplied', issues),
		applicationUnitId: requiredId(input.applicationUnitId),
		applicationDate: input.applicationDate ?? '',
		applicatorProfileId: actorDefaultProfileId(input.applicatorProfileId, input.actorProfileId),
		applicationMethodId: optionalUuid(input.applicationMethodId, 'applicationMethodId', issues),
		vehicleId: optionalUuid(input.vehicleId, 'vehicleId', issues),
		equipmentId: optionalUuid(input.equipmentId, 'equipmentId', issues),
		applicationBatches: normalizeApplicationBatches(input.applicationBatches ?? [], issues),
	};
}

export function normalizeSourceReductionFields(
	input: {
		readonly actorProfileId: DomainId;
		readonly sourceReductionDate: LocalDateString | undefined;
		readonly sourcesEliminatedAmount: number | undefined;
		readonly sourcesEliminatedUnitId: DomainId;
		readonly sourceReductionMethodId?: DomainId | null;
		readonly technicianProfileId?: DomainId | null;
	},
	issues: DomainValidationIssue[],
): NormalizedSourceReductionFields {
	requiredUuid(input.sourcesEliminatedUnitId, 'sourcesEliminatedUnitId', issues);
	validateLocalDate(input.sourceReductionDate, 'sourceReductionDate', issues);
	return {
		sourceReductionDate: input.sourceReductionDate ?? '',
		sourcesEliminatedAmount: positiveFiniteNumber(
			input.sourcesEliminatedAmount,
			'sourcesEliminatedAmount',
			issues,
		),
		sourcesEliminatedUnitId: requiredId(input.sourcesEliminatedUnitId),
		sourceReductionMethodId: optionalUuid(
			input.sourceReductionMethodId,
			'sourceReductionMethodId',
			issues,
		),
		technicianProfileId: actorDefaultProfileId(input.technicianProfileId, input.actorProfileId),
	};
}

export function normalizeMissionSourceReductionFields(
	input: {
		readonly actorProfileId: DomainId;
		readonly sourceReductionDate: LocalDateString | undefined;
		readonly sourcesEliminatedAmount: number | undefined;
		readonly sourcesEliminatedUnitId: DomainId;
		readonly sourceReductionMethodId?: DomainId | null;
		readonly technicianProfileId?: DomainId | null;
	},
	issues: DomainValidationIssue[],
): NormalizedSourceReductionFields {
	requiredUuid(input.sourcesEliminatedUnitId, 'sourcesEliminatedUnitId', issues);
	validateLocalDate(input.sourceReductionDate, 'sourceReductionDate', issues);
	return {
		sourceReductionDate: input.sourceReductionDate ?? '',
		sourcesEliminatedAmount: positiveFiniteNumber(
			input.sourcesEliminatedAmount,
			'sourcesEliminatedAmount',
			issues,
		),
		sourcesEliminatedUnitId: requiredId(input.sourcesEliminatedUnitId),
		sourceReductionMethodId: optionalUuid(
			input.sourceReductionMethodId,
			'sourceReductionMethodId',
			issues,
		),
		technicianProfileId: actorDefaultProfileId(input.technicianProfileId, input.actorProfileId),
	};
}

export function normalizeOutreachFields(
	input: {
		readonly actorProfileId: DomainId;
		readonly outreachDate: LocalDateString | undefined;
		readonly reach: number | undefined;
		readonly outreachMethodId?: DomainId | null;
		readonly technicianProfileId?: DomainId | null;
		readonly reachDescription?: string | null;
	},
	issues: DomainValidationIssue[],
): NormalizedOutreachFields {
	validateLocalDate(input.outreachDate, 'outreachDate', issues);
	return {
		outreachDate: input.outreachDate ?? '',
		reach: positiveInteger(input.reach, 'reach', issues),
		outreachMethodId: optionalUuid(input.outreachMethodId, 'outreachMethodId', issues),
		technicianProfileId: actorDefaultProfileId(input.technicianProfileId, input.actorProfileId),
		reachDescription: nullableText(input.reachDescription, 'reachDescription', issues, 2_000),
	};
}

export function normalizeMissionOutreachFields(
	input: {
		readonly actorProfileId: DomainId;
		readonly outreachDate: LocalDateString | undefined;
		readonly reach: number | undefined;
		readonly outreachMethodId?: DomainId | null;
		readonly technicianProfileId?: DomainId | null;
		readonly reachDescription?: string | null;
	},
	issues: DomainValidationIssue[],
): NormalizedOutreachFields {
	validateLocalDate(input.outreachDate, 'outreachDate', issues);
	return {
		outreachDate: input.outreachDate ?? '',
		reach: positiveInteger(input.reach, 'reach', issues),
		outreachMethodId: optionalUuid(input.outreachMethodId, 'outreachMethodId', issues),
		technicianProfileId: actorDefaultProfileId(input.technicianProfileId, input.actorProfileId),
		reachDescription: nullableText(input.reachDescription, 'reachDescription', issues, 2_000),
	};
}

export function normalizeBiocontrolFields(
	input: {
		readonly actorProfileId: DomainId;
		readonly biocontrolDate: LocalDateString | undefined;
		readonly amountReleased: number | undefined;
		readonly releaseUnitId: DomainId;
		readonly biocontrolMethodId?: DomainId | null;
		readonly technicianProfileId?: DomainId | null;
	},
	issues: DomainValidationIssue[],
): NormalizedBiocontrolFields {
	requiredUuid(input.releaseUnitId, 'releaseUnitId', issues);
	validateLocalDate(input.biocontrolDate, 'biocontrolDate', issues);
	return {
		biocontrolDate: input.biocontrolDate ?? '',
		amountReleased: positiveFiniteNumber(input.amountReleased, 'amountReleased', issues),
		releaseUnitId: requiredId(input.releaseUnitId),
		biocontrolMethodId: optionalUuid(input.biocontrolMethodId, 'biocontrolMethodId', issues),
		technicianProfileId: actorDefaultProfileId(input.technicianProfileId, input.actorProfileId),
	};
}

export function normalizeMissionBiocontrolFields(
	input: {
		readonly actorProfileId: DomainId;
		readonly biocontrolDate: LocalDateString | undefined;
		readonly amountReleased: number | undefined;
		readonly releaseUnitId: DomainId;
		readonly biocontrolMethodId?: DomainId | null;
		readonly technicianProfileId?: DomainId | null;
	},
	issues: DomainValidationIssue[],
): NormalizedBiocontrolFields {
	requiredUuid(input.releaseUnitId, 'releaseUnitId', issues);
	validateLocalDate(input.biocontrolDate, 'biocontrolDate', issues);
	return {
		biocontrolDate: input.biocontrolDate ?? '',
		amountReleased: positiveFiniteNumber(input.amountReleased, 'amountReleased', issues),
		releaseUnitId: requiredId(input.releaseUnitId),
		biocontrolMethodId: optionalUuid(input.biocontrolMethodId, 'biocontrolMethodId', issues),
		technicianProfileId: actorDefaultProfileId(input.technicianProfileId, input.actorProfileId),
	};
}

export function validateControlActionContext(
	context: ControlActionContext,
	allowedFor: PerformedControlActionKind | 'requestedAction' | ControlType,
	issues: DomainValidationIssue[],
): ControlActionContext {
	if (context?.kind === 'none') {
		return { kind: 'none' };
	}
	if (context?.kind === 'adult') {
		requiredUuid(context.collectionId, 'context.collectionId', issues);
		if (!['chemicalApplication', 'requestedAction', 'application'].includes(allowedFor)) {
			issues.push({
				path: 'context.kind',
				message: 'Adult collection context is not allowed here.',
			});
		}
		return { kind: 'adult', collectionId: requiredId(context.collectionId) };
	}
	if (context?.kind === 'larval') {
		const hasHabitat = context.habitatId !== undefined && optionalId(context.habitatId) !== null;
		const hasInspection =
			context.inspectionId !== undefined && optionalId(context.inspectionId) !== null;
		if (!hasHabitat && !hasInspection) {
			issues.push({
				path: 'context',
				message: 'Larval context requires habitatId or inspectionId.',
			});
		}
		if (hasHabitat) {
			requiredUuid(context.habitatId, 'context.habitatId', issues);
		}
		if (hasInspection) {
			requiredUuid(context.inspectionId, 'context.inspectionId', issues);
		}
		if (allowedFor === 'outreach') {
			if (hasHabitat) {
				issues.push({
					path: 'context.habitatId',
					message: 'Outreach context cannot reference a habitat directly.',
				});
			}
			if (!hasInspection) {
				issues.push({
					path: 'context.inspectionId',
					message: 'Outreach larval context requires inspectionId.',
				});
			}
		}
		return {
			kind: 'larval',
			...(hasHabitat ? { habitatId: requiredId(context.habitatId) } : {}),
			...(hasInspection ? { inspectionId: requiredId(context.inspectionId) } : {}),
		};
	}
	issues.push({ path: 'context.kind', message: 'context.kind is not supported.' });
	return { kind: 'none' };
}

function normalizeApplicationBatches(
	values: readonly ApplicationBatchInput[],
	issues: DomainValidationIssue[],
): readonly ApplicationBatchInput[] {
	if (!Array.isArray(values)) {
		issues.push({ path: 'applicationBatches', message: 'applicationBatches must be an array.' });
		return [];
	}
	const applicationBatchIds = new Set<string>();
	const insecticideBatchIds = new Set<string>();
	return values.map((value, index) => {
		requiredUuid(
			value.applicationBatchId,
			`applicationBatches.${index}.applicationBatchId`,
			issues,
		);
		requiredUuid(
			value.insecticideBatchId,
			`applicationBatches.${index}.insecticideBatchId`,
			issues,
		);
		const applicationBatchId = requiredId(value.applicationBatchId);
		const insecticideBatchId = requiredId(value.insecticideBatchId);
		if (applicationBatchIds.has(applicationBatchId)) {
			issues.push({
				path: `applicationBatches.${index}.applicationBatchId`,
				message: 'applicationBatchId values must be unique.',
			});
		}
		if (insecticideBatchIds.has(insecticideBatchId)) {
			issues.push({
				path: `applicationBatches.${index}.insecticideBatchId`,
				message: 'insecticideBatchId values must be unique.',
			});
		}
		applicationBatchIds.add(applicationBatchId);
		insecticideBatchIds.add(insecticideBatchId);
		return { applicationBatchId, insecticideBatchId };
	});
}

function positiveFiniteNumber(
	value: number | undefined,
	path: string,
	issues: DomainValidationIssue[],
): number {
	if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
		issues.push({ path, message: `${path} must be a positive finite number.` });
		return 0;
	}
	return value;
}

function positiveInteger(
	value: number | undefined,
	path: string,
	issues: DomainValidationIssue[],
): number {
	if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
		issues.push({ path, message: `${path} must be a positive integer.` });
		return 0;
	}
	return value;
}
