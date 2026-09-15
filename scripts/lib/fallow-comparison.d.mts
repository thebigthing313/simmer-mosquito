/**
 * Types for `fallow-comparison.mjs`, so a TypeScript suite can pin the
 * comparison `pnpm fallow:health` and `pnpm fallow dupes` report through.
 *
 * The module is JavaScript because every gate under `scripts/` is, and the
 * workspace compiles no JavaScript. This file is what lets one TypeScript suite
 * across the boundary; it is declarations only, so nothing is emitted and it
 * sits outside the project's `rootDir` the way `masked-source.d.mts` does.
 */

/** One health baseline as fallow saves it, with only the keys this reads named. */
export interface HealthBaseline {
	readonly finding_counts?: Readonly<Record<string, Readonly<Record<string, { count: number }>>>>;
	readonly target_keys?: readonly string[];
}

/** The percentage and file count fallow's duplication summary carried. */
export interface DuplicationSummary {
	readonly percentage: number;
	readonly files: string;
}

/** A threshold a run was gated against, and the words saying where it came from. */
export interface MeasuredThreshold {
	readonly value: number;
	readonly source: string;
}

/** One argument list with a known answer, handed to the guard on a gating run. */
export interface ComparisonProbe {
	readonly name: string;
	readonly args: readonly string[];
	readonly expected: string | null;
}

export function flagValue(args: readonly string[], flag: string): string | null;

export function freshnessArgs(args: readonly string[], destination: string): string[];

export function baselineEntries(baseline: HealthBaseline): string[];

export function findingCounts(baseline: HealthBaseline): Map<string, number>;

export function regressionsBetween(saved: HealthBaseline, fresh: HealthBaseline): string[];

export function unmodelledComparisonFlag(args: readonly string[]): string | null;

export const PROBES: readonly ComparisonProbe[];

export function probeFailures(): string[];

export function verdictOutcome(regressions: string[] | null, baselinePath: string): string;

export function fallowsCross(counted: string): string;

export function standing(measured: number, threshold: number): string;

export function duplicationOutcome(
	duplication: DuplicationSummary | null,
	threshold: MeasuredThreshold | null,
): string;

export function withoutComments(source: string): string;
