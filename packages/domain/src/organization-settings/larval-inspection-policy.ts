import { createIssues, throwIfIssues } from '../command-validation.js';
import type { DomainValidationIssue } from '../shared.js';
import {
	DEFAULT_LARVAL_INSPECTION_ENTRY_POLICY,
	type LarvalDensity,
	type LarvalDensityRanges,
	type LarvalInspectionEntryMode,
	type LarvalInspectionEntryPolicy,
	type ResolvedLarvalInspectionEntryPolicy,
} from './types-and-defaults.js';

const LARVAL_DENSITIES = ['none', 'light', 'medium', 'heavy', 'very_heavy'] as const;
const RANGE_DENSITIES = ['light', 'medium', 'heavy', 'very_heavy'] as const;
const LARVAL_INSPECTION_ENTRY_MODES = [
	'density_only',
	'count_and_dips_required',
	'hybrid',
] as const;

export function validateLarvalInspectionEntryPolicy(
	policy: LarvalInspectionEntryPolicy | null | undefined,
): ResolvedLarvalInspectionEntryPolicy {
	const issues = createIssues();
	const resolved = resolveLarvalInspectionEntryPolicy(policy, issues, 'policy');
	throwIfIssues('Larval inspection entry policy is invalid.', issues);
	return resolved;
}

export function resolveLarvalInspectionEntryPolicy(
	policy: LarvalInspectionEntryPolicy | null | undefined,
	issues: DomainValidationIssue[] = createIssues(),
	path = 'policy',
): ResolvedLarvalInspectionEntryPolicy {
	const mode = policy?.mode ?? DEFAULT_LARVAL_INSPECTION_ENTRY_POLICY.mode;
	if (!LARVAL_INSPECTION_ENTRY_MODES.includes(mode)) {
		issues.push({ path: `${path}.mode`, message: 'Unsupported larval inspection entry mode.' });
	}
	const densityRanges = policy?.densityRanges ?? null;
	if (densityRanges !== null) {
		validateDensityRanges(densityRanges, `${path}.densityRanges`, issues);
	}
	return {
		mode: LARVAL_INSPECTION_ENTRY_MODES.includes(mode)
			? mode
			: DEFAULT_LARVAL_INSPECTION_ENTRY_POLICY.mode,
		densityRanges,
	};
}

export function isLarvalDensity(value: unknown): value is LarvalDensity {
	return typeof value === 'string' && LARVAL_DENSITIES.includes(value as LarvalDensity);
}

export function inferLarvalDensity(
	larvaeCount: number,
	dipCount: number,
	ranges: LarvalDensityRanges,
	path: string,
	issues: DomainValidationIssue[],
): LarvalDensity | null {
	if (larvaeCount === 0) {
		return 'none';
	}
	const rate = larvaeCount / dipCount;
	for (const density of RANGE_DENSITIES) {
		const range = ranges[density === 'very_heavy' ? 'veryHeavy' : density];
		if (
			rate >= range.minInclusive &&
			(range.maxExclusive === undefined || range.maxExclusive === null || rate < range.maxExclusive)
		) {
			return density;
		}
	}
	issues.push({ path, message: 'Configured density ranges did not match larvae per dip.' });
	return null;
}

export function isLarvalInspectionEntryMode(value: unknown): value is LarvalInspectionEntryMode {
	return (
		typeof value === 'string' &&
		LARVAL_INSPECTION_ENTRY_MODES.includes(value as LarvalInspectionEntryMode)
	);
}

function validateDensityRanges(
	ranges: LarvalDensityRanges,
	path: string,
	issues: DomainValidationIssue[],
): void {
	let previousMax: number | null = null;
	for (const density of RANGE_DENSITIES) {
		const range = ranges[density === 'very_heavy' ? 'veryHeavy' : density];
		if (range === undefined) {
			issues.push({ path: `${path}.${density}`, message: `${density} range is required.` });
			continue;
		}
		if (!Number.isFinite(range.minInclusive) || range.minInclusive < 0) {
			issues.push({
				path: `${path}.${density}.minInclusive`,
				message: 'minInclusive must be a finite number greater than or equal to zero.',
			});
		}
		const maxExclusive = range.maxExclusive ?? null;
		if (
			maxExclusive !== null &&
			(!Number.isFinite(maxExclusive) || maxExclusive <= range.minInclusive)
		) {
			issues.push({
				path: `${path}.${density}.maxExclusive`,
				message: 'maxExclusive must be greater than minInclusive when present.',
			});
		}
		if (previousMax === null && range.minInclusive !== 0) {
			issues.push({
				path: `${path}.${density}.minInclusive`,
				message: 'The first density range must start at zero.',
			});
		}
		if (previousMax !== null && range.minInclusive !== previousMax) {
			issues.push({
				path: `${path}.${density}.minInclusive`,
				message: 'Density ranges must be contiguous.',
			});
		}
		previousMax = maxExclusive;
	}
	if (ranges.veryHeavy?.maxExclusive !== undefined && ranges.veryHeavy.maxExclusive !== null) {
		issues.push({
			path: `${path}.very_heavy.maxExclusive`,
			message: 'The very_heavy range must be open-ended.',
		});
	}
}
