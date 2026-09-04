import type { LarvalDensity } from './column-vocabularies.js';
import {
	createIssues,
	isFutureBeyondClockSkew,
	requiredId as normalizeRequiredId,
	requiredUuid as requireUuid,
	throwIfIssues,
	validateNotFutureLocalDate,
} from './command-validation.js';
import {
	inferLarvalDensity,
	isLarvalDensity,
	type LarvalInspectionEntryPolicy,
	resolveLarvalInspectionEntryPolicy,
} from './organization-settings/index.js';
import type { DomainId, DomainValidationIssue, LocalDateString } from './shared.js';

/**
 * Field-record shapes shared by the domains that *produce* surveillance records
 * and the domains that *dispatch* the work producing them.
 *
 * `larvalSurveillance.*` and `adultSurveillance.*` own inspections and
 * collections. `fieldWork.*` owns assignments, and its execution commands
 * record an inspection or a collection against the assignment stop that sent
 * the technician there — so it needs the same field validation without
 * importing another domain module. Neither domain folder imports the other;
 * they meet here, exactly as `controlOperations.*` and `missionDispatch.*` meet
 * in `performed-control-actions.ts`.
 *
 * Nothing here knows about assignments, missions, or command envelopes. It
 * validates and normalizes the fields of a record, and stops there.
 */

// --- Larval inspection results -------------------------------------------------

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

export function normalizeLarvalInspectionResult(
	input: LarvalInspectionResultInput,
): NormalizedLarvalInspectionResult {
	const issues = createIssues();
	const result = normalizeInspectionResult(input, 'result', issues);
	throwIfIssues('Larval inspection result is invalid.', issues);
	return result;
}

export function normalizeInspectionResult(
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

	checkEntryPolicy(policy.mode, { dipCount, larvaeCount, density }, path, issues);
	checkCountAgreement({ dipCount, larvaeCount, density }, path, issues);

	// A configured larvae-per-dip table is authoritative: it derives the band
	// rather than trusting the one the device sent, and disagreement is an error
	// rather than a silent overwrite.
	const normalizedDensity =
		policy.densityRanges !== null && larvaeCount !== null && dipCount !== null
			? inferBandedDensity(
					{ larvaeCount, dipCount, density, ranges: policy.densityRanges },
					path,
					issues,
				)
			: density;

	const isBreedingPositive =
		normalizedDensity !== null && normalizedDensity !== 'none'
			? true
			: larvaeCount !== null && larvaeCount > 0;
	checkStageAgreement(isBreedingPositive, hasAnyStage, path, issues);

	return {
		isWet: input.isWet,
		dipCount,
		density: normalizedDensity,
		larvaeCount,
		isBreedingPositive,
		...stageFlags,
	};
}

/** Abundance fields as they stand before the policy has had its say. */
interface AbundanceFields {
	readonly dipCount: number | null;
	readonly larvaeCount: number | null;
	readonly density: LarvalDensity | null;
}

/**
 * What the agency's chosen entry mode insists on.
 *
 * Density-only agencies record a band and never a count; count-and-dips
 * agencies record both numbers; hybrid accepts either, and only complains when
 * neither is complete.
 */
function checkEntryPolicy(
	mode: LarvalInspectionEntryPolicy['mode'],
	fields: AbundanceFields,
	path: string,
	issues: DomainValidationIssue[],
): void {
	const { dipCount, larvaeCount, density } = fields;
	switch (mode) {
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
			return;
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
			return;
		case 'hybrid':
			if (density === null && (larvaeCount === null || dipCount === null)) {
				issues.push({
					path,
					message: 'Wet inspections require density or larvaeCount with dipCount.',
				});
			}
			return;
	}
}

/**
 * Agreement between the numbers themselves, whatever the policy.
 *
 * A count is meaningless without the dips it came from, and a band that says
 * "none" cannot sit beside a positive count.
 */
function checkCountAgreement(
	fields: AbundanceFields,
	path: string,
	issues: DomainValidationIssue[],
): void {
	const { dipCount, larvaeCount, density } = fields;
	if (larvaeCount !== null && dipCount === null) {
		issues.push({
			path: `${path}.dipCount`,
			message: 'dipCount is required when larvaeCount is provided.',
		});
	}
	if (larvaeCount === null || density === null) {
		return;
	}
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

function inferBandedDensity(
	input: {
		readonly larvaeCount: number;
		readonly dipCount: number;
		readonly density: LarvalDensity | null;
		readonly ranges: NonNullable<LarvalInspectionEntryPolicy['densityRanges']>;
	},
	path: string,
	issues: DomainValidationIssue[],
): LarvalDensity | null {
	const inferred = inferLarvalDensity(
		input.larvaeCount,
		input.dipCount,
		input.ranges,
		path,
		issues,
	);
	if (input.density !== null && inferred !== null && input.density !== inferred) {
		issues.push({
			path: `${path}.density`,
			message: 'density must match the configured larvae-per-dip range.',
		});
	}
	return inferred;
}

/** Life stages and abundance have to tell the same story. */
function checkStageAgreement(
	isBreedingPositive: boolean,
	hasAnyStage: boolean,
	path: string,
	issues: DomainValidationIssue[],
): void {
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

// --- Adult collection timing ---------------------------------------------------

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

export function validateOperationalDate(
	value: Date | undefined,
	path: string,
	issues: DomainValidationIssue[],
): void {
	if (!isValidDate(value)) {
		issues.push({ path, message: `${path} must be a valid Date.` });
		return;
	}
	if (isFutureBeyondClockSkew(value)) {
		issues.push({ path, message: `${path} cannot be in the future.` });
	}
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
	validateNotFutureLocalDate(timing.collectionDate, `${path}.collectionDate`, issues);
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

function isValidDate(value: Date | undefined): value is Date {
	return value instanceof Date && !Number.isNaN(value.getTime());
}
