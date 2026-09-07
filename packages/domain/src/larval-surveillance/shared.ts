import { createIssues, requiredUuid as requireUuid, validateBase } from '../command-validation.js';
import {
	type AdHocInspectionLocationSource,
	type AdHocInspectionLocationSourceInput,
	validateAdHocInspectionLocationSource,
} from '../location-intent.js';
import type { DomainId, DomainValidationIssue } from '../shared.js';
import type { UpdateFieldNormalizer } from '../update-command-fields.js';

export type ImmatureStageFlag =
	| 'hasFirstInstar'
	| 'hasSecondInstar'
	| 'hasThirdInstar'
	| 'hasFourthInstar'
	| 'hasPupae'
	| 'hasEggs';

export type LarvalSurveillanceCommandType =
	| 'larvalSurveillance.createHabitat'
	| 'larvalSurveillance.createHabitatFromInspection'
	| 'larvalSurveillance.updateHabitatDetails'
	| 'larvalSurveillance.updateHabitatLocation'
	| 'larvalSurveillance.updateHabitatConfiguration'
	| 'larvalSurveillance.markHabitatInaccessible'
	| 'larvalSurveillance.clearHabitatInaccessible'
	| 'larvalSurveillance.retireHabitat'
	| 'larvalSurveillance.reactivateHabitat'
	| 'larvalSurveillance.deleteHabitat'
	| 'larvalSurveillance.mergeHabitats'
	| 'larvalSurveillance.recordHabitatInspection'
	| 'larvalSurveillance.recordAdHocInspection'
	| 'larvalSurveillance.updateInspectionFieldDetails'
	| 'larvalSurveillance.updateAdHocInspectionLocation'
	| 'larvalSurveillance.deleteInspection'
	| 'larvalSurveillance.addInspectionSample'
	| 'larvalSurveillance.addUnlabeledInspectionSample'
	| 'larvalSurveillance.updateInspectionSample'
	| 'larvalSurveillance.deleteInspectionSample'
	| 'larvalSurveillance.markSampleZeroLarvae'
	| 'larvalSurveillance.clearSampleZeroLarvae'
	| 'larvalSurveillance.setSampleNonMosquitoPresence'
	| 'larvalSurveillance.setSampleUnidentifiableReason'
	| 'larvalSurveillance.addSampleSpeciesCount'
	| 'larvalSurveillance.updateSampleSpeciesCount'
	| 'larvalSurveillance.deleteSampleSpeciesCount';

export interface LarvalDomainCommand<TType extends LarvalSurveillanceCommandType, TPayload> {
	readonly type: TType;
	readonly payload: TPayload;
}

export interface LarvalCommandInput {
	readonly organizationId: DomainId;
	readonly actorProfileId: DomainId;
}

export interface LarvalCommandPayload {
	readonly organizationId: DomainId;
	readonly actorProfileId: DomainId;
}

export interface SampleSpeciesIdLike extends LarvalCommandInput {
	readonly sampleSpeciesId: DomainId;
}

export function validateSampleBase(input: {
	readonly organizationId: DomainId;
	readonly actorProfileId: DomainId;
	readonly sampleId: DomainId;
	readonly inspectionId: DomainId;
}): DomainValidationIssue[] {
	const issues = createIssues();
	validateBase(input, issues);
	requireUuid(input.sampleId, 'sampleId', issues);
	requireUuid(input.inspectionId, 'inspectionId', issues);
	return issues;
}

export function validateSampleSpeciesBase(input: SampleSpeciesIdLike): DomainValidationIssue[] {
	const issues = createIssues();
	validateBase(input, issues);
	requireUuid(input.sampleSpeciesId, 'sampleSpeciesId', issues);
	return issues;
}

export function validatePositiveInteger(
	value: number | undefined,
	path: string,
	issues: DomainValidationIssue[],
): void {
	if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
		issues.push({ path, message: `${path} must be a positive integer.` });
	}
}

/** Where an ad hoc Inspection sits, as an update command's field descriptor names it. */
export const adHocInspectionLocationSourceField: UpdateFieldNormalizer<
	AdHocInspectionLocationSourceInput | undefined,
	AdHocInspectionLocationSource
> = (value, path, issues) => validateAdHocInspectionLocationSource(value, path, issues);

/** How many larvae one sample held, as a field descriptor names it. */
export const larvaeCountField: UpdateFieldNormalizer<number | undefined, number> = (
	value,
	path,
	issues,
) => {
	validatePositiveInteger(value, path, issues);
	return value as number;
};
