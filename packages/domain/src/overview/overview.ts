/**
 * What the period-in-review pages count, and the shape `GET /overview/:grain`
 * answers with. `docs/today-spec.md` is the brief.
 *
 * The register is the domain's rather than the Dashboard strip's because two
 * layers agree on it: the reader in `packages/db` runs one statement per
 * entry and the pages in `apps/web` draw one row per entry, in this order.
 */

import type { OverviewGrain } from './period.js';

/**
 * The eight record types, in row order, each counted on the date #980 and
 * #992 settled: an inspection on `inspection_date`, a sample on its parent
 * inspection's, a collection on its effective date, and the rest on their
 * own operational date.
 */
export const OVERVIEW_RECORD_TYPES = [
	'inspections',
	'samples',
	'collections',
	'applications',
	'sourceReductions',
	'releases',
	'serviceRequests',
	'outreachActions',
] as const;

export type OverviewRecordType = (typeof OVERVIEW_RECORD_TYPES)[number];

/**
 * The two ratios under the eight rows, each a ratio of sums and never a mean
 * of ratios. The value beside each is the type whose rows carry its numerator
 * and denominator, and whose count decides which years qualify for its
 * average.
 */
export const OVERVIEW_RATIO_TYPES = {
	positiveInspections: 'inspections',
	mosquitoesPerCollection: 'collections',
} as const satisfies Record<string, OverviewRecordType>;

export type OverviewRatio = keyof typeof OVERVIEW_RATIO_TYPES;

export const OVERVIEW_RATIOS = Object.keys(OVERVIEW_RATIO_TYPES) as readonly OverviewRatio[];

/**
 * One calendar day of one type, as the reader groups it. `numerator` and
 * `denominator` are carried by the two types that own a ratio: inspections
 * return the positive count over the day's count, collections return the
 * mosquitoes over the collections that count. Derived from the same rows as
 * the count beside them, so the two cannot disagree.
 */
export interface OverviewDailyRow {
	/** `YYYY-MM-DD` in the Organization's zone. */
	readonly day: string;
	readonly count: number;
	readonly numerator?: number;
	readonly denominator?: number;
}

export type OverviewColumnKey = 'period' | 'previous' | 'lastYear' | 'average';

export type OverviewColumn =
	/** A real column, at the cut, for its header and its link. */
	| {
			readonly key: 'period' | 'previous' | 'lastYear';
			readonly from: string;
			readonly to: string;
	  }
	/** Header only, no link. */
	| { readonly key: 'average'; readonly years: { readonly from: number; readonly to: number } };

export interface OverviewSeriesPoint {
	/** Spelled as the page's own picker spells it: `YYYY-MM-DD`, `YYYY-MM` or `YYYY`. */
	readonly period: string;
	readonly value: number;
}

export interface OverviewRatioPoint {
	readonly period: string;
	readonly numerator: number;
	readonly denominator: number;
}

export interface OverviewTypeRow {
	readonly type: OverviewRecordType;
	/** False hides the row and its chart: the Organization has never recorded one. */
	readonly recordedEver: boolean;
	/** Positional against `columns`; null only in the average column. */
	readonly values: readonly (number | null)[];
	/** Qualifying years behind the average; 0 draws the absence glyph. */
	readonly averageYears: number;
	readonly series: readonly OverviewSeriesPoint[];
}

export interface OverviewRatioRow {
	readonly ratio: OverviewRatio;
	/** Positional against `columns`; the average column is the pooled sum. */
	readonly numerators: readonly number[];
	readonly denominators: readonly number[];
	readonly averageYears: number;
	readonly series: readonly OverviewRatioPoint[];
}

export interface OverviewResponse {
	readonly grain: OverviewGrain;
	/** As the page's picker spells it. */
	readonly period: string;
	/** `YYYY-MM-DD` in the Organization's zone. */
	readonly today: string;
	/** The cut date when the period is partial, else null. Never set on `day`. */
	readonly cutThrough: string | null;
	/** The earliest dated record across the eight types; null when nothing is recorded. */
	readonly earliest: string | null;
	/** Four on `day` and `month`, three on `year`. */
	readonly columns: readonly OverviewColumn[];
	/** All eight, in register order. */
	readonly types: readonly OverviewTypeRow[];
	readonly ratios: readonly OverviewRatioRow[];
}
