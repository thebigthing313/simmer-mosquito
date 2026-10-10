/**
 * The Organization's clock: what time it is, which day it is, and how an
 * instant reads, all on the Organization's zone.
 *
 * An instant has no day and no time of day until a zone is named, and the zone
 * that names it here is always the Organization's (#154). Before this module
 * that zone was threaded by hand: a component read it, held it, and handed it
 * to one of four copies of the same `en-US` date-and-time options block, each
 * with its own answer for a value it could not read (#1433). This is the one
 * copy, and the answer it gives is #609's.
 *
 * Components read it through `useOrganizationClock`. Suites, read hooks and
 * modules that are not components build one with {@link createOrganizationClock}
 * and a fixed zone, and a fixed now when the answer depends on it.
 *
 * Calendar-day labels are not here. A `YYYY-MM-DD` names a day rather than an
 * instant, so no zone applies to it, and `local-date.ts` renders those on the
 * UTC clock.
 */

import { getToday } from './get-today';
import { localCalendarDay, todayInTimeZone } from './local-date';
import { unreadable } from './unreadable-input';

/**
 * How {@link OrganizationClock.formatInstant} writes an instant.
 *
 * - `dateTime`: `Aug 12, 2026, 4:30 PM`, a stamp on a detail page.
 * - `date`: `Aug 12, 2026`, the day an instant fell on.
 * - `dueAt`: `Aug 12, 4:30 PM`, a deadline inside the season it was set in.
 * - `time`: `4:30 PM`, beside a day the page already names.
 * - `relative`: `3m ago`, and a named day past a week.
 */
export type InstantStyle = 'dateTime' | 'date' | 'dueAt' | 'time' | 'relative';

/** The clock {@link createOrganizationClock} returns, bound to one zone and one now. */
export interface OrganizationClock {
	/**
	 * The zone itself, for the write-path helpers in `local-date.ts` that turn a
	 * calendar day into an instant and still take one.
	 */
	readonly zone: string;
	/** The current instant, which is `getToday()` unless a now was injected. */
	now(): Date;
	/** The Organization's `YYYY-MM-DD` for {@link now}. */
	today(): string;
	/**
	 * The Organization's `YYYY-MM-DD` for an instant. Empty for an absent or
	 * unreadable one, which is what an unset date field holds.
	 */
	dayOf(instant: Date | string | null | undefined): string;
	/**
	 * An instant as text, in one of the {@link InstantStyle} shapes.
	 *
	 * `null` in is `null` out, so a caller that hides an absent value keeps doing
	 * so. A value that will not read goes back on screen with a warning naming the
	 * style, through `unreadable-input.ts`.
	 */
	formatInstant(value: Date | string, style: InstantStyle): string;
	formatInstant(value: Date | string | null, style: InstantStyle): string | null;
}

/** The `Intl` options behind every style but `relative`, which picks its own. */
const INSTANT_OPTIONS: Readonly<
	Record<Exclude<InstantStyle, 'relative'>, Intl.DateTimeFormatOptions>
> = {
	dateTime: { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' },
	date: { year: 'numeric', month: 'short', day: 'numeric' },
	dueAt: { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' },
	time: { hour: 'numeric', minute: '2-digit' },
};

/**
 * A clock on `zone`, reading the current instant from `now`.
 *
 * `now` defaults to `getToday`, so the `TODAY_OVERRIDE` pin moves every answer
 * here at once, the relative style included. The comment timestamps measured
 * against `Date.now()` before this and ignored the pin.
 */
export function createOrganizationClock(
	zone: string,
	now: () => Date = getToday,
): OrganizationClock {
	const formatters = new Map<string, Intl.DateTimeFormat>();
	const formatter = (key: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat => {
		let cached = formatters.get(key);
		if (cached === undefined) {
			cached = new Intl.DateTimeFormat('en-US', { ...options, timeZone: zone });
			formatters.set(key, cached);
		}
		return cached;
	};

	function formatInstant(value: Date | string, style: InstantStyle): string;
	function formatInstant(value: Date | string | null, style: InstantStyle): string | null;
	function formatInstant(value: Date | string | null, style: InstantStyle): string | null {
		if (value === null) {
			return null;
		}
		const instant = value instanceof Date ? value : new Date(value);
		if (Number.isNaN(instant.getTime())) {
			// An Invalid Date stringifies as `Invalid Date`, which is what arrived.
			return unreadable(`formatInstant (${style})`, String(value));
		}
		if (style === 'relative') {
			return relative(instant, now(), formatter);
		}
		return formatter(style, INSTANT_OPTIONS[style]).format(instant);
	}

	return {
		zone,
		now,
		today: () => todayInTimeZone(zone, now()),
		dayOf: (instant) => localCalendarDay(instant, zone),
		formatInstant,
	};
}

/**
 * How long before `at` the instant `then` was.
 *
 * The durations are zone-free: an elapsed span is the same number wherever it
 * is read. Past a week this names the day instead, and a named day needs the
 * zone, which is why `format` is the clock's own.
 */
function relative(
	then: Date,
	at: Date,
	format: (key: string, options: Intl.DateTimeFormatOptions) => Intl.DateTimeFormat,
): string {
	const seconds = Math.round((at.getTime() - then.getTime()) / 1000);
	if (seconds < 45) {
		return 'just now';
	}
	const minutes = Math.round(seconds / 60);
	if (minutes < 60) {
		return `${minutes}m ago`;
	}
	const hours = Math.round(minutes / 60);
	if (hours < 24) {
		return `${hours}h ago`;
	}
	const days = Math.round(hours / 24);
	if (days < 7) {
		return `${days}d ago`;
	}
	// The year is dropped inside the current one. Which year each instant falls in
	// is a zone question too, so both are read on the clock's zone: otherwise a
	// comment left on New Year's Eve is in this year to one reader and not to the
	// next.
	const year = format('year', { year: 'numeric' });
	const sameYear = year.format(then) === year.format(at);
	return sameYear
		? format('relativeDay', { month: 'short', day: 'numeric' }).format(then)
		: format('relativeDayYear', { month: 'short', day: 'numeric', year: 'numeric' }).format(then);
}
