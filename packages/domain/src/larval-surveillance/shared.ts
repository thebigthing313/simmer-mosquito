import {
	createIssues,
	requiredUuid as requireUuid,
	validateAgencyCommandContext,
} from '../command-validation.js';
import {
	type AdHocInspectionLocationSource,
	type AdHocInspectionLocationSourceInput,
	type HabitatLocationSource,
	type HabitatLocationSourceInput,
	validateAdHocInspectionLocationSource,
	validateHabitatLocationSource,
} from '../location-intent.js';
import type { DomainId, DomainValidationIssue, LocalDateString } from '../shared.js';

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

export interface HabitatIdLike extends LarvalCommandInput {
	readonly habitatId: DomainId;
}

export interface SampleIdLike extends LarvalCommandInput {
	readonly sampleId: DomainId;
}

export interface SampleSpeciesIdLike extends LarvalCommandInput {
	readonly sampleSpeciesId: DomainId;
}

export function validateBase(input: LarvalCommandInput, issues: DomainValidationIssue[]): void {
	validateAgencyCommandContext(input, issues);
}

export function validateIdCommand<T extends LarvalCommandInput>(
	input: T,
	idKey: keyof T & string,
): DomainValidationIssue[] {
	const issues = createIssues();
	validateBase(input, issues);
	requireUuid(input[idKey] as string | undefined, idKey, issues);
	return issues;
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

export function validateLocalDate(
	value: LocalDateString | undefined,
	path: string,
	issues: DomainValidationIssue[],
): void {
	if (value === undefined || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
		issues.push({ path, message: `${path} must be a YYYY-MM-DD date string.` });
		return;
	}
	const parsed = new Date(`${value}T00:00:00.000Z`);
	if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
		issues.push({ path, message: `${path} must be a valid calendar date.` });
		return;
	}
	const today = new Date().toISOString().slice(0, 10);
	if (value > today) {
		issues.push({ path, message: `${path} cannot be in the future.` });
	}
}

export function normalizeNullableText(value: string | null | undefined): string | null {
	if (value === undefined || value === null) {
		return null;
	}
	const trimmed = value.trim();
	return trimmed.length === 0 ? null : trimmed;
}

export function validateHabitatLocationSourceInput(
	input: {
		readonly locationSource?: HabitatLocationSourceInput;
	},
	issues: DomainValidationIssue[],
): HabitatLocationSource {
	const hasLocationSource = input.locationSource !== undefined;
	if (hasLocationSource) {
		return validateHabitatLocationSource(input.locationSource, 'locationSource', issues);
	}
	issues.push({ path: 'locationSource', message: 'locationSource is required.' });
	return validateHabitatLocationSource(
		{ kind: 'geometry', geometry: { type: 'Point', coordinates: [0, 0] } },
		'locationSource',
		issues,
	);
}

export function validateAdHocInspectionLocationSourceInput(
	input: {
		readonly locationSource?: AdHocInspectionLocationSourceInput;
	},
	issues: DomainValidationIssue[],
): AdHocInspectionLocationSource {
	const hasLocationSource = input.locationSource !== undefined;
	if (hasLocationSource) {
		return validateAdHocInspectionLocationSource(input.locationSource, 'locationSource', issues);
	}
	issues.push({ path: 'locationSource', message: 'locationSource is required.' });
	return validateAdHocInspectionLocationSource(
		{ kind: 'geometry', geometry: { type: 'Point', coordinates: [0, 0] } },
		'locationSource',
		issues,
	);
}

export function basePayload(input: LarvalCommandInput): LarvalCommandPayload {
	return validateAgencyCommandContext(input, createIssues());
}
