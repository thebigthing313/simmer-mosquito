import {
	createIssues,
	isFutureBeyondClockSkew,
	jsonObject as normalizeMetadata,
	requiredId as normalizeRequiredId,
	requiredUuid as requireUuid,
	validateNotFutureLocalDate,
	validateOrganizationCommandContext,
} from '../command-validation.js';
import {
	type AdultCollectionLocationSource,
	type AdultCollectionLocationSourceInput,
	type TrapLocationSource,
	type TrapLocationSourceInput,
	validateAdultCollectionLocationSource,
	validateTrapLocationSource,
} from '../location-intent.js';
import type { UnitType } from '../organization-settings/types-and-defaults.js';
import type { DomainId, DomainValidationIssue, JsonObject } from '../shared.js';
import { validateOperationalDate } from '../surveillance-records.js';

export type {
	CollectedCollectionTiming,
	CollectionTiming,
	DateDurationCollectionTiming,
	ExactCollectedCollectionTiming,
	ExactPendingCollectionTiming,
} from '../surveillance-records.js';
export {
	validateCollectedTiming,
	validateOperationalDate,
	validateTiming,
} from '../surveillance-records.js';

export type AdultSurveillanceCommandType =
	| 'adultSurveillance.createTrap'
	| 'adultSurveillance.updateTrapDetails'
	| 'adultSurveillance.updateTrapConfiguration'
	| 'adultSurveillance.retireTrap'
	| 'adultSurveillance.reactivateTrap'
	| 'adultSurveillance.deleteTrap'
	| 'adultSurveillance.setTrapCollection'
	| 'adultSurveillance.setAdHocCollection'
	| 'adultSurveillance.recordCollectedTrapCollection'
	| 'adultSurveillance.recordCollectedAdHocCollection'
	| 'adultSurveillance.collectCollection'
	| 'adultSurveillance.cancelPendingCollection'
	| 'adultSurveillance.updateCollectionFieldDetails'
	| 'adultSurveillance.updateAdHocCollectionConfiguration'
	| 'adultSurveillance.deleteCollection'
	| 'adultSurveillance.addCollectionSpeciesCount'
	| 'adultSurveillance.updateCollectionSpeciesCount'
	| 'adultSurveillance.deleteCollectionSpeciesCount'
	| 'adultSurveillance.markCollectionZeroResult'
	| 'adultSurveillance.clearCollectionZeroResult'
	| 'adultSurveillance.setCollectionBycatch';

export interface DomainCommand<TType extends AdultSurveillanceCommandType, TPayload> {
	readonly type: TType;
	readonly payload: TPayload;
}

export interface AdultCommandInput {
	readonly organizationId: DomainId;
	readonly actorProfileId: DomainId;
}

export interface AdultCommandPayload {
	readonly organizationId: DomainId;
	readonly actorProfileId: DomainId;
}

export interface CollectionBaseInput extends AdultCommandInput {
	readonly collectionId: DomainId;
	readonly metadata?: unknown | null;
}

export interface CollectionBasePayload extends AdultCommandPayload {
	readonly collectionId: DomainId;
	readonly metadata: JsonObject | null;
}

export function validateBase(input: AdultCommandInput, issues: DomainValidationIssue[]): void {
	validateOrganizationCommandContext(input, issues);
}

export function validateIdCommand<T extends AdultCommandInput>(
	input: T,
	idKey: keyof T & string,
): DomainValidationIssue[] {
	const issues = createIssues();
	validateBase(input, issues);
	requireUuid(input[idKey] as string | undefined, idKey, issues);
	return issues;
}

export function validateCollectionBase(input: CollectionBaseInput): DomainValidationIssue[] {
	const issues = createIssues();
	validateBase(input, issues);
	requireUuid(input.collectionId, 'collectionId', issues);
	normalizeMetadata(input.metadata, 'metadata', issues);
	return issues;
}

export function validateSpeciesCountBase(input: {
	readonly organizationId: DomainId;
	readonly actorProfileId: DomainId;
	readonly collectionSpeciesId: DomainId;
}): DomainValidationIssue[] {
	const issues = createIssues();
	validateBase(input, issues);
	requireUuid(input.collectionSpeciesId, 'collectionSpeciesId', issues);
	return issues;
}

export function validateTrapDisplay(
	trapName: string | null,
	trapCode: string | null,
	issues: DomainValidationIssue[],
): void {
	if (trapName === null && trapCode === null) {
		issues.push({
			path: 'trapDisplay',
			message: 'At least one of trapName or trapCode is required.',
		});
	}
}

export function validateTrapLocationSourceInput(
	input: {
		readonly locationSource?: TrapLocationSourceInput;
	},
	issues: DomainValidationIssue[],
): TrapLocationSource {
	const hasLocationSource = input.locationSource !== undefined;
	if (hasLocationSource) {
		return validateTrapLocationSource(input.locationSource, 'locationSource', issues);
	}
	issues.push({ path: 'locationSource', message: 'locationSource is required.' });
	return validateTrapLocationSource(
		{ kind: 'geometry', geometry: { type: 'Point', coordinates: [0, 0] } },
		'locationSource',
		issues,
	);
}

export function validateAdultCollectionLocationSourceInput(
	input: {
		readonly locationSource?: AdultCollectionLocationSourceInput;
	},
	issues: DomainValidationIssue[],
): AdultCollectionLocationSource {
	const hasLocationSource = input.locationSource !== undefined;
	if (hasLocationSource) {
		return validateAdultCollectionLocationSource(input.locationSource, 'locationSource', issues);
	}
	issues.push({ path: 'locationSource', message: 'locationSource is required.' });
	return validateAdultCollectionLocationSource(
		{ kind: 'geometry', geometry: { type: 'Point', coordinates: [0, 0] } },
		'locationSource',
		issues,
	);
}

export function validateSpeciesCount(
	count: number | undefined,
	path: string,
	issues: DomainValidationIssue[],
): void {
	if (typeof count !== 'number' || !Number.isInteger(count) || count <= 0) {
		issues.push({ path, message: 'count must be a positive integer.' });
	}
}

export function normalizeNullableText(value: string | null | undefined): string | null {
	if (value === undefined || value === null) {
		return null;
	}
	const trimmed = value.trim();
	return trimmed.length === 0 ? null : trimmed;
}

export function collectionBasePayload(input: CollectionBaseInput): CollectionBasePayload {
	const issues = createIssues();
	return {
		...basePayload(input),
		collectionId: normalizeRequiredId(input.collectionId),
		metadata: normalizeMetadata(input.metadata, 'metadata', issues),
	};
}

export function basePayload(input: AdultCommandInput): AdultCommandPayload {
	return validateOrganizationCommandContext(input, createIssues());
}

function isValidDate(value: Date | undefined): value is Date {
	return value instanceof Date && !Number.isNaN(value.getTime());
}

/**
 * The unit types a trap's run length can be measured in.
 *
 * A collection recorded as a date plus a duration is saying how long the trap
 * ran, so only time units carry meaning — a weight or an area would be recorded
 * without complaint and read back as nonsense. Mirrors the shape the control
 * domain uses for its amount fields (`isBiocontrolUnitType` and friends): the
 * unit row is not available at command-build time, so this narrows what a form
 * offers rather than what the builder rejects.
 */
export const COLLECTION_DURATION_UNIT_TYPES = ['duration'] as const;

export function isCollectionDurationUnitType(unitType: UnitType): boolean {
	return COLLECTION_DURATION_UNIT_TYPES.includes(
		unitType as (typeof COLLECTION_DURATION_UNIT_TYPES)[number],
	);
}
