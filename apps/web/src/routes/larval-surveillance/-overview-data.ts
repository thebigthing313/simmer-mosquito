import { sessionFetch } from '@simmer-mosquito/sync';
import { gte, useLiveQuery } from '@tanstack/react-db';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { getServerUrl } from '../../auth';
import { useSpeciesNames } from '../../hooks/queries/use-species-names';
import { sample_species } from '../../lib/collections/sample_species';
import { addCalendarDays, calendarDateParts, utcCalendarDay } from '../../lib/local-date';
import { unreadable, warnUnreadable } from '../../lib/unreadable-input';

/** How far back the recent-window queries (heavy list, open samples) reach. */
export const ACTIVITY_WINDOW_DAYS = 14;
/** Days in a calendar week (the daily-inspections strip). */
const WEEK_LENGTH = 7;

// Inspections, samples, and sample_species are on-demand shapes (docs/sync.md).
// Keep the subset warm briefly after unmount so quick nav back reuses it.
const activityGcTimeMs = 30_000;

// --- projected query shapes -------------------------------------------------

/** One sample awaiting identification, as returned by the overview read endpoint. */
export interface AwaitingSample {
	readonly id: string;
	readonly displayName: string | null;
	readonly inspectionDate: string;
	readonly habitatId: string | null;
	readonly habitatName: string | null;
	/** The parent inspection's centroid — what titles a sample with no habitat. */
	readonly lat: number | null;
	readonly lng: number | null;
}

export interface SpeciesTotal {
	readonly speciesId: string;
	readonly name: string;
	readonly total: number;
}

interface LoadState {
	readonly isReady: boolean;
	readonly isError: boolean;
}

// --- live-data hooks --------------------------------------------------------

// Inspection queries stay deliberately flat — a single on-demand subset keyed on
// `inspection_date` — rather than nesting samples/species includes: a nested
// include fans out an Electric subset request over every inspection id in the
// window, whose URL exceeds request limits and fails. Sample-derived panels read
// from a server endpoint instead ({@link useSamplesAwaiting}).
//
// All use the status-gated {@link useLiveQuery} (not the suspense variant) because
// the suspense hook hangs after a navigation unmount over on-demand collections.

/**
 * Larvae totals by species over the given window (identified_at based), sorted
 * high to low. Species names resolve from the eager `species` catalog.
 */
export function useSpeciesComposition(sinceDate: string): {
	readonly totals: readonly SpeciesTotal[];
	readonly grandTotal: number;
} & LoadState {
	const nameById = useSpeciesNames();

	const result = useLiveQuery(
		{
			gcTime: activityGcTimeMs,
			query: (query) =>
				query
					.from({ identification: sample_species() })
					.where(({ identification }) => gte(identification.identified_at, sinceDate))
					.select(({ identification }) => ({
						speciesId: identification.species_id,
						larvaeCount: identification.larvae_count,
					})),
		},
		[sinceDate],
	);

	const rows = result.data;

	const { totals, grandTotal } = useMemo(() => {
		const byId = new Map<string, number>();
		let sum = 0;
		for (const row of rows) {
			const count = row.larvaeCount ?? 0;
			if (count <= 0) {
				continue;
			}
			byId.set(row.speciesId, (byId.get(row.speciesId) ?? 0) + count);
			sum += count;
		}
		const ranked: SpeciesTotal[] = [...byId.entries()]
			.map(([speciesId, total]) => ({
				speciesId,
				total,
				name: nameById.get(speciesId) ?? 'Unknown species',
			}))
			.sort((first, second) => second.total - first.total);
		return { totals: ranked, grandTotal: sum };
	}, [rows, nameById]);

	return { totals, grandTotal, isReady: result.isReady, isError: result.isError };
}

// --- samples awaiting identification (server read endpoint) -----------------

/** The preview length the overview asks the endpoint for. */
const AWAITING_SAMPLES_PREVIEW = 6;

/**
 * Recent samples awaiting identification, resolved by the server rather than a
 * client-side join: the awaiting set spans every habitat in the window, which a
 * nested on-demand include can't gather in one bounded request.
 */
export function useSamplesAwaiting(sinceDate: string): {
	readonly samples: readonly AwaitingSample[];
	readonly total: number;
	readonly isLoading: boolean;
	readonly isError: boolean;
} {
	const query = useQuery({
		queryKey: ['larval-overview', 'awaiting-samples', sinceDate, AWAITING_SAMPLES_PREVIEW],
		queryFn: ({ signal }) => fetchSamplesAwaiting(sinceDate, AWAITING_SAMPLES_PREVIEW, signal),
		placeholderData: (previous) => previous,
		staleTime: 30_000,
	});

	return {
		samples: query.data?.samples ?? [],
		total: query.data?.total ?? 0,
		isLoading: query.isLoading,
		isError: query.isError,
	};
}

async function fetchSamplesAwaiting(
	sinceDate: string,
	limit: number,
	signal: AbortSignal,
): Promise<{ readonly total: number; readonly samples: AwaitingSample[] }> {
	const url = new URL('/larval-surveillance/samples/awaiting', getServerUrl());
	url.searchParams.set('since', sinceDate);
	url.searchParams.set('limit', String(limit));
	const response = await sessionFetch(url, { signal });
	if (!response.ok) {
		throw new Error(`Awaiting samples request failed (${response.status}).`);
	}
	return (await response.json()) as { readonly total: number; readonly samples: AwaitingSample[] };
}

// --- pure date helpers (operate on `YYYY-MM-DD` strings) --------------------

// `todayInTimeZone` lives in `lib/local-date` — every section defaults a date
// with it, so it is not a larval-surveillance fact. Re-exported here because the
// other three overview modules already re-export it from this one.
export { todayInTimeZone } from '../../lib/local-date';

/**
 * Shift a `YYYY-MM-DD` string by whole days, staying in UTC to avoid DST drift.
 *
 * The arithmetic is `addCalendarDays`, which has been guarded all along; this had
 * its own copy, which reached `toISOString` on an Invalid Date and threw
 * `RangeError: Invalid time value` into the render tree (#609). The name stays
 * because twenty-five call sites across seventeen files read it from here, three
 * of them the other overview modules re-exporting it.
 *
 * What is added on top is the report. `addCalendarDays` echoes an unreadable
 * date in silence, deliberately, because a sync bound built from one has a reader
 * below it that refuses the value again. A day strip has no such reader: the
 * string goes on screen, so somebody has to be told.
 */
export function addDaysToDateString(date: string, days: number): string {
	if (calendarDateParts(date) === undefined) {
		return unreadable('addDaysToDateString', date);
	}
	return addCalendarDays(date, days);
}

/**
 * The Sunday that starts the calendar week containing `date`.
 *
 * An unreadable date comes back untouched, so the week strip built from it draws
 * seven copies of what arrived rather than throwing the page away.
 */
export function startOfWeek(date: string): string {
	const parts = calendarDateParts(date);
	if (parts === undefined) {
		return unreadable('startOfWeek', date);
	}
	return addCalendarDays(date, -utcCalendarDay(parts).getUTCDay());
}

/** The seven dates of the calendar week beginning at `weekStart`, Sunday first. */
export function buildWeek(weekStart: string): readonly string[] {
	return Array.from({ length: WEEK_LENGTH }, (_, index) => addDaysToDateString(weekStart, index));
}

/** `Wed` — the weekday cell above a day in the week strip. */
export function weekdayLabel(date: string): string {
	return utcLabel('weekdayLabel', date, { weekday: 'short' });
}

/**
 * The day number under that weekday.
 *
 * Zero for a date this cannot read, because the answer has to be a number and
 * `NaN` was being handed downstream. No month has a day zero, so a strip showing
 * one is visibly not showing a date; a 1 would read as the first of the month
 * and could not be told from a real day.
 */
export function dayOfMonth(date: string): number {
	const parts = calendarDateParts(date);
	if (parts === undefined) {
		warnUnreadable('dayOfMonth', date);
		return NO_DAY;
	}
	return utcCalendarDay(parts).getUTCDate();
}

/** The day number no month has, which is how an unreadable date reads on a strip. */
const NO_DAY = 0;

/**
 * A record's own date, with the weekday it fell on: `Wed, Aug 12`.
 *
 * Field work runs on a weekly rhythm — a trap set Monday and collected
 * Wednesday, a route walked every Thursday — so the weekday is what tells an
 * operator whether a gap in a run is a missed visit or just the weekend. It
 * belongs on dates that ARE the record; {@link formatMonthDay} stays the plain
 * form for the places a date is a bound or a heading rather than a fact about
 * one record.
 */
export function formatWeekdayMonthDay(date: string): string {
	return utcLabel('formatWeekdayMonthDay', date, {
		weekday: 'short',
		month: 'short',
		day: 'numeric',
	});
}

/**
 * The same, carrying the year: `Wed, Aug 12, 2026`.
 *
 * For a list that spans seasons — a trap's whole run of collections — where
 * {@link formatWeekdayMonthDay} alone would make two Augusts look like one.
 */
export function formatWeekdayDate(date: string): string {
	return utcLabel('formatWeekdayDate', date, {
		weekday: 'short',
		year: 'numeric',
		month: 'short',
		day: 'numeric',
	});
}

export function formatMonthDay(date: string): string {
	return utcLabel('formatMonthDay', date, { month: 'short', day: 'numeric' });
}

/**
 * The active date-range chip's words, with either bound possibly open.
 *
 * Beside {@link formatMonthDay} because that is what it reads. The inspections
 * filter bar and the samples explorer each held a copy, character for
 * character, down to the unspaced en dash between the two bounds.
 */
export function dateRangeLabel(from: string, to: string): string {
	if (from === '' && to === '') {
		return 'All dates';
	}
	if (from === '') {
		return `Until ${formatMonthDay(to)}`;
	}
	if (to === '') {
		return `From ${formatMonthDay(from)}`;
	}
	return `${formatMonthDay(from)}–${formatMonthDay(to)}`;
}

/**
 * `Mar 4, 26` — the explorer list date.
 *
 * The year is not optional here. An explorer's window is whatever the operator
 * set it to, so a bare "Mar 4" in a list spanning two seasons names two
 * different days. It is written in full: "May 27, 26" reads as a day-month-year
 * in the parts of the world that write dates that way, and surveillance records
 * are dated evidence — the year should not need decoding.
 */
export function formatListDate(date: string): string {
	return utcLabel('formatListDate', date, {
		month: 'short',
		day: 'numeric',
		year: 'numeric',
	});
}

/** Full numeric date, `M/D/YYYY` (e.g. `7/10/2026`). */
export function formatDate(date: string): string {
	return utcLabel('formatDate (larval overview)', date, {
		year: 'numeric',
		month: 'numeric',
		day: 'numeric',
	});
}

/**
 * The shape all six labels above share: read the calendar date, render it on the
 * UTC clock, and hand it back untouched when it will not read.
 *
 * `en-US` and `timeZone: 'UTC'` are the parts that are not the caller's, and
 * they are why this is one function. The zone is the whole point of the module:
 * a calendar date is a day, and naming any other zone is what makes `Aug 12`
 * render as the 11th west of Greenwich. The options each caller passes are the
 * whole of what differs, so nothing here decides how a date looks.
 *
 * `formatter` is the name in the warning, so it is the caller's own rather than
 * this one's. A console line saying `utcLabel` would name the shape and not the
 * screen.
 */
function utcLabel(formatter: string, date: string, options: Intl.DateTimeFormatOptions): string {
	const parts = calendarDateParts(date);
	if (parts === undefined) {
		return unreadable(formatter, date);
	}
	return new Intl.DateTimeFormat('en-US', { ...options, timeZone: 'UTC' }).format(
		utcCalendarDay(parts),
	);
}
