import {
	createIssues,
	jsonObject as normalizeMetadata,
	requiredId as normalizeRequiredId,
	requiredUuid as requireUuid,
	validateAgencyCommandContext,
} from '../command-validation.js';
import {
	type AdultCollectionLocationSource,
	type AdultCollectionLocationSourceInput,
	type TrapLocationSource,
	type TrapLocationSourceInput,
	validateAdultCollectionLocationSource,
	validateTrapLocationSource,
} from '../location-intent.js';
import type { DomainId, DomainValidationIssue, JsonObject, LocalDateString } from '../shared.js';

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

export type CollectionTimingMode = 'exact_timestamps' | 'collection_date_duration';

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

export interface ExactPendingCollectionTiming {
	readonly mode: 'exact_timestamps';
	readonly startedAt: Date;
}

export interface ExactCollectedCollectionTiming {
	readonly mode: 'exact_timestamps';
	readonly startedAt: Date;
	readonly collectedAt: Date;
}

export interface DateDurationCollectionTiming {
	readonly mode: 'collection_date_duration';
	readonly collectionDate: LocalDateString;
	readonly durationAmount: number;
	readonly durationUnitId: DomainId;
}

export type CollectionTiming =
	| ExactPendingCollectionTiming
	| ExactCollectedCollectionTiming
	| DateDurationCollectionTiming;

export type CollectedCollectionTiming =
	| ExactCollectedCollectionTiming
	| DateDurationCollectionTiming;

export interface CollectionBaseInput extends AdultCommandInput {
	readonly collectionId: DomainId;
	readonly metadata?: unknown | null;
}

export interface CollectionBasePayload extends AdultCommandPayload {
	readonly collectionId: DomainId;
	readonly metadata: JsonObject | null;
}

export function validateBase(input: AdultCommandInput, issues: DomainValidationIssue[]): void {
	validateAgencyCommandContext(input, issues);
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

export function validateTiming(
	timing: CollectionTiming | undefined,
	path: string,
	issues: DomainValidationIssue[],
): CollectionTiming | undefined {
	if (timing === undefined) {
		return undefined;
	}
	if (timing.mode === 'collection_date_duration') {
		return validateDateDurationTiming(timing, path, issues);
	}
	validateOperationalDate(timing.startedAt, `${path}.startedAt`, issues);
	if ('collectedAt' in timing) {
		validateCollectedAtAfterStartedAt(timing.startedAt, timing.collectedAt, path, issues);
		return {
			mode: 'exact_timestamps',
			startedAt: timing.startedAt,
			collectedAt: timing.collectedAt,
		};
	}
	return { mode: 'exact_timestamps', startedAt: timing.startedAt };
}

export function validateCollectedTiming(
	timing: CollectedCollectionTiming,
	path: string,
	issues: DomainValidationIssue[],
): CollectedCollectionTiming {
	if (timing.mode === 'collection_date_duration') {
		return validateDateDurationTiming(timing, path, issues);
	}
	validateCollectedAtAfterStartedAt(timing.startedAt, timing.collectedAt, path, issues);
	return {
		mode: 'exact_timestamps',
		startedAt: timing.startedAt,
		collectedAt: timing.collectedAt,
	};
}

function validateDateDurationTiming(
	timing: DateDurationCollectionTiming,
	path: string,
	issues: DomainValidationIssue[],
): DateDurationCollectionTiming {
	validateLocalDate(timing.collectionDate, `${path}.collectionDate`, issues);
	if (!Number.isFinite(timing.durationAmount) || timing.durationAmount <= 0) {
		issues.push({
			path: `${path}.durationAmount`,
			message: 'durationAmount must be greater than zero.',
		});
	}
	requireUuid(timing.durationUnitId, `${path}.durationUnitId`, issues);
	return {
		mode: 'collection_date_duration',
		collectionDate: timing.collectionDate,
		durationAmount: timing.durationAmount,
		durationUnitId: normalizeRequiredId(timing.durationUnitId),
	};
}

function validateCollectedAtAfterStartedAt(
	startedAt: Date,
	collectedAt: Date,
	path: string,
	issues: DomainValidationIssue[],
): void {
	validateOperationalDate(startedAt, `${path}.startedAt`, issues);
	validateOperationalDate(collectedAt, `${path}.collectedAt`, issues);
	if (isValidDate(startedAt) && isValidDate(collectedAt) && collectedAt < startedAt) {
		issues.push({
			path: `${path}.collectedAt`,
			message: 'collectedAt must be greater than or equal to startedAt.',
		});
	}
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

export function validateOperationalDate(
	value: Date | undefined,
	path: string,
	issues: DomainValidationIssue[],
): void {
	if (!isValidDate(value)) {
		issues.push({ path, message: `${path} must be a valid Date.` });
		return;
	}
	if (value.getTime() > Date.now()) {
		issues.push({ path, message: `${path} cannot be in the future.` });
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

export function collectionBasePayload(input: CollectionBaseInput): CollectionBasePayload {
	const issues = createIssues();
	return {
		...basePayload(input),
		collectionId: normalizeRequiredId(input.collectionId),
		metadata: normalizeMetadata(input.metadata, 'metadata', issues),
	};
}

export function basePayload(input: AdultCommandInput): AdultCommandPayload {
	return validateAgencyCommandContext(input, createIssues());
}

export function isValidDate(value: Date | undefined): value is Date {
	return value instanceof Date && !Number.isNaN(value.getTime());
}
