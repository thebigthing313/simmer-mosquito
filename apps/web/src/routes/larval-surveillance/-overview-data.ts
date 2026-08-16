import type { LarvalDensity, SpeciesRow } from '@simmer-mosquito/sync';
import { gte, useLiveQuery } from '@tanstack/react-db';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { getServerUrl } from '../../auth';
import type { LifeStageFlags } from '../../components/larval-display';
import { useCollectionRows } from '../../hooks/use-collection-rows';
import { webCollections } from '../../sync/webCollections';

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
	const { rows: species } = useCollectionRows<SpeciesRow>(webCollections.species);
	const nameById = useMemo(
		() => new Map(species.map((row) => [row.id, row.displayName] as const)),
		[species],
	);

	const result = useLiveQuery(
		{
			gcTime: activityGcTimeMs,
			query: (query) =>
				query
					.from({ sampleSpecies: webCollections.sampleSpecies })
					.where(({ sampleSpecies }) => gte(sampleSpecies.identifiedAt, sinceDate))
					.select(({ sampleSpecies }) => ({
						speciesId: sampleSpecies.speciesId,
						larvaeCount: sampleSpecies.larvaeCount,
					})),
		},
		[sinceDate],
	);

	const { totals, grandTotal } = useMemo(() => {
		const rows = (result.data ?? []) as readonly { speciesId: string; larvaeCount: number }[];
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
	}, [result.data, nameById]);

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
	const response = await fetch(url, { credentials: 'include', signal });
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

/** Shift a `YYYY-MM-DD` string by whole days, staying in UTC to avoid DST drift. */
export function addDaysToDateString(date: string, days: number): string {
	const utc = parseDateString(date);
	utc.setUTCDate(utc.getUTCDate() + days);
	return utc.toISOString().slice(0, 10);
}

/** The Sunday that starts the calendar week containing `date`. */
export function startOfWeek(date: string): string {
	return addDaysToDateString(date, -parseDateString(date).getUTCDay());
}

/** The seven dates of the calendar week beginning at `weekStart`, Sunday first. */
export function buildWeek(weekStart: string): readonly string[] {
	return Array.from({ length: WEEK_LENGTH }, (_, index) => addDaysToDateString(weekStart, index));
}

export function weekdayLabel(date: string): string {
	return new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'UTC' }).format(
		parseDateString(date),
	);
}

export function dayOfMonth(date: string): number {
	return parseDateString(date).getUTCDate();
}

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
	const parsed = parseDateString(date);
	if (Number.isNaN(parsed.getTime())) {
		return '—';
	}
	return new Intl.DateTimeFormat('en-US', {
		weekday: 'short',
		month: 'short',
		day: 'numeric',
		timeZone: 'UTC',
	}).format(parsed);
}

/**
 * The same, carrying the year: `Wed, Aug 12, 2026`.
 *
 * For a list that spans seasons — a trap's whole run of collections — where
 * {@link formatWeekdayMonthDay} alone would make two Augusts look like one.
 */
export function formatWeekdayDate(date: string): string {
	const parsed = parseDateString(date);
	if (Number.isNaN(parsed.getTime())) {
		return '—';
	}
	return new Intl.DateTimeFormat('en-US', {
		weekday: 'short',
		year: 'numeric',
		month: 'short',
		day: 'numeric',
		timeZone: 'UTC',
	}).format(parsed);
}

export function formatMonthDay(date: string): string {
	const parsed = parseDateString(date);
	if (Number.isNaN(parsed.getTime())) {
		return '—';
	}
	return new Intl.DateTimeFormat('en-US', {
		month: 'short',
		day: 'numeric',
		timeZone: 'UTC',
	}).format(parsed);
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
	const parsed = parseDateString(date);
	if (Number.isNaN(parsed.getTime())) {
		return '—';
	}
	return new Intl.DateTimeFormat('en-US', {
		month: 'short',
		day: 'numeric',
		year: 'numeric',
		timeZone: 'UTC',
	}).format(parsed);
}

/** Full numeric date, `M/D/YYYY` (e.g. `7/10/2026`). */
export function formatDate(date: string): string {
	const parsed = parseDateString(date);
	if (Number.isNaN(parsed.getTime())) {
		return '—';
	}
	return new Intl.DateTimeFormat('en-US', {
		year: 'numeric',
		month: 'numeric',
		day: 'numeric',
		timeZone: 'UTC',
	}).format(parsed);
}

// Tolerates a bare `YYYY-MM-DD` as well as a full ISO timestamp (e.g. a Postgres
// date serialized through JSON) by reading only the leading date portion.
function parseDateString(date: string): Date {
	const parts = date.slice(0, 10).split('-');
	const year = Number(parts[0]);
	const month = Number(parts[1]);
	const day = Number(parts[2]);
	if (!(Number.isFinite(year) && Number.isFinite(month) && Number.isFinite(day))) {
		return new Date(Number.NaN);
	}
	return new Date(Date.UTC(year, month - 1, day));
}
