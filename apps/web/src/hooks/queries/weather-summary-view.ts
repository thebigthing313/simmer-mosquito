/** How long a station's summaries stay warm after the detail page unmounts. */
export const summariesGcTimeMs = 30_000;

/**
 * Bounds that admit every reading, for the caller that wants them all.
 *
 * A `date` column is fixed-width and zero-padded, so comparing it as a string is
 * comparing it as a date, and one pair of literals stands in for "no bound"
 * without a second query shape. Year zero does not exist in Postgres, so the
 * lower bound is year one.
 */
export const EVERY_DAY = { from: '0001-01-01', to: '9999-12-31' } as const;

/**
 * Which year a reading belongs to: the one its bucket ends in.
 *
 * Read off the string rather than through a `Date`, for the reason in the module
 * comment. One end rather than both, because a bucket running from the 30th of
 * December to the 2nd of January has to land in one year or the card would list
 * it under two, and the card already orders by `end_date`.
 */
export function summaryYear(date: string): number {
	return Number(date.slice(0, 4));
}

export interface WeatherSummaryListing {
	readonly id: string;
	/** `YYYY-MM-DD`. Never a `Date`, see the module comment. */
	readonly startDate: string;
	readonly endDate: string;
	readonly temperatureMinF: number | null;
	readonly temperatureMaxF: number | null;
	readonly precipitationInches: number | null;
	readonly relativeHumidityMin: number | null;
	readonly relativeHumidityMax: number | null;
	readonly windSpeedMinMph: number | null;
	readonly windSpeedMaxMph: number | null;
}

export interface WeatherSummariesRead {
	readonly summaries: readonly WeatherSummaryListing[];
	readonly isReady: boolean;
	readonly isError: boolean;
}
