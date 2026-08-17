/**
 * Calendar dates, in the agency's local time.
 *
 * A date column here is a *calendar date* — the day an inspection happened, the
 * day an assignment is scheduled for — not an instant. `new Date('2026-08-04')`
 * parses as UTC midnight, which is the previous day everywhere west of
 * Greenwich, so the parts are read out and handed to the local constructor
 * instead. Nine copies of this pair had accumulated across the record forms
 * before it was named once.
 */

import { getToday } from './get-today';

/**
 * Today's date in the org's timezone as a `YYYY-MM-DD` string.
 *
 * Here rather than in a domain's `-overview-data` module because "what is today"
 * is not a fact about larval surveillance: every section's forms default a date
 * with it, and reaching across route trees for one is how a private route module
 * becomes a shared library nobody named.
 *
 * `instant` names a moment other than now — which calendar day some *other*
 * instant falls on in the zone, the same question with a different subject.
 */
export function todayInTimeZone(timeZone: string | undefined, instant?: Date): string {
	return new Intl.DateTimeFormat('en-CA', {
		timeZone: timeZone || undefined,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
	}).format(instant ?? getToday());
}

/** A `YYYY-MM-DD` string as a local Date, or undefined when empty or malformed. */
export function parseLocalDate(value: string | null | undefined): Date | undefined {
	const parts = calendarDateParts(value);
	if (parts === undefined) {
		return undefined;
	}
	const date = new Date(parts.year, parts.month - 1, parts.day);
	return Number.isNaN(date.getTime()) ? undefined : date;
}

interface CalendarDateParts {
	readonly year: number;
	readonly month: number;
	readonly day: number;
}

/**
 * A leading `YYYY-MM-DD`, which is both what a date column holds and how a
 * timestamp starts — so a full ISO string yields the day it begins on.
 */
const CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})/;

/**
 * The year, month, and day a `YYYY-MM-DD` names, before any zone is applied.
 *
 * Read out as numbers rather than as a Date because which *instant* that
 * calendar day begins at is a separate question, answered differently for the
 * browser's zone and the agency's, and answering it too early is what
 * {@link parseLocalDate} can only do one way.
 *
 * One match rather than a split and three range checks: every value that
 * reaches here is a date column, a date input, or something already rejected,
 * and the shape is the whole of what makes it readable.
 */
function calendarDateParts(value: string | null | undefined): CalendarDateParts | undefined {
	const match = value === null || value === undefined ? null : CALENDAR_DATE.exec(value);
	if (match === null) {
		return undefined;
	}
	return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

/**
 * A `YYYY-MM-DD` plus a whole number of days.
 *
 * Done in UTC, where every day is 24 hours: adding a day in a zone that springs
 * forward that night lands on the same date it started from. The value is a
 * calendar date and the answer is a calendar date, so no zone is involved.
 *
 * An unreadable date comes back untouched rather than as `NaN-NaN-NaN`, so a
 * caller building a bound from one gets a value the reader below still refuses
 * rather than one it silently accepts.
 */
export function addCalendarDays(date: string, days: number): string {
	const parts = calendarDateParts(date);
	if (parts === undefined) {
		return date;
	}
	const shifted = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
	return Number.isNaN(shifted.getTime()) ? date : formatUtcDate(shifted);
}

/** A UTC Date back to `YYYY-MM-DD`, reading the UTC parts. See {@link formatLocalDate}. */
function formatUtcDate(date: Date): string {
	const year = `${date.getUTCFullYear()}`.padStart(4, '0');
	const month = `${date.getUTCMonth() + 1}`.padStart(2, '0');
	const day = `${date.getUTCDate()}`.padStart(2, '0');
	return `${year}-${month}-${day}`;
}

/** A local Date back to `YYYY-MM-DD`, reading the local parts rather than the UTC ones. */
export function formatLocalDate(date: Date): string {
	const year = date.getFullYear();
	const month = `${date.getMonth() + 1}`.padStart(2, '0');
	const day = `${date.getDate()}`.padStart(2, '0');
	return `${year}-${month}-${day}`;
}

/**
 * The start of an agency-local calendar day as a lower bound for a `timestamptz`
 * column.
 *
 * A bare `YYYY-MM-DD` cannot be compared against a `timestamptz` in a sync
 * predicate: Postgres would cast it, but Electric rejects it outright with
 * `invalid syntax for type timestamptz`, and the whole shape request 400s.
 *
 * The bound is also evaluated a second time, in the browser — TanStack DB re-runs
 * the same `where` as a plain JS `>=` over the raw strings Electric streams, which
 * look like `2026-07-24 06:12:33.481+00`. So the format has to match those
 * character for character (space separator, `+00` offset, no `T` or `Z`) or the
 * two comparisons disagree and same-day rows arrive from the server only to be
 * filtered out on the client.
 *
 * The day starts where the *agency* says it does. Without the zone this began at
 * the browser's midnight, so the same window asked for different records
 * depending on who opened the page — and at the edge the difference is a record
 * missing from the range, not a record shown on the wrong day.
 *
 * An unreadable date yields the epoch — an effectively absent lower bound, which
 * shows too much rather than silently showing nothing.
 */
export function localDayStartAsTimestamp(
	date: string | null | undefined,
	timeZone: string | undefined,
): string {
	const iso = localDayStartAsInstant(date, timeZone).toISOString();
	return `${iso.slice(0, 10)} ${iso.slice(11, 19)}+00`;
}

/**
 * The same bound, as the instant it is.
 *
 * What {@link localDayStartAsTimestamp} exists to work around is gone on a
 * collection whose row schema parses `timestamptz`: the column holds a `Date`, the
 * browser re-runs the predicate as `Date >= Date`, and the subset compiler emits
 * `toISOString()` on the way out to Electric. Nothing has to match a wire format
 * character for character, because nothing is comparing text.
 *
 * So the string form is for the surfaces still reading raw Electric strings, and
 * this is for the ones reading through `lib/collections`. Handing a string bound
 * to a parsed column compares a `Date` against text, which orders by neither.
 *
 * Same epoch fallback, for the same reason: an unreadable date shows too much
 * rather than silently showing nothing.
 */
export function localDayStartAsInstant(
	date: string | null | undefined,
	timeZone: string | undefined,
): Date {
	return zonedDayStart(date, timeZone) ?? new Date(0);
}

/** A `HH:MM` time-of-day, the shape a `<input type="time">` and a picker both hold. */
const WALL_TIME = /^(\d{2}):(\d{2})$/;

/**
 * The instant a wall time on a calendar day names in the agency's zone.
 *
 * The inverse of reading a stored instant back on the agency's clock. A form asks
 * for a day and a time because that is how the work is planned; the column is one
 * `timestamptz`, and which instant that pair names is only a fact once a zone
 * says so. Left to the browser, the same typed "16:00" is a different instant for
 * a dispatcher working from home two zones away — and it is read back on the
 * agency's clock either way, so it comes back as a time nobody typed.
 *
 * Null rather than an Invalid Date when either half is unreadable, so the domain
 * builder reports the missing field instead of the browser reporting NaN.
 */
export function localTimeAsInstant(
	date: string | null | undefined,
	time: string,
	timeZone: string,
): string | null {
	const parts = calendarDateParts(date);
	const clock = WALL_TIME.exec(time);
	if (parts === undefined || clock === null) {
		return null;
	}
	const wall = Date.UTC(parts.year, parts.month - 1, parts.day, Number(clock[1]), Number(clock[2]));
	if (Number.isNaN(wall)) {
		return null;
	}
	return new Date(instantReading(wall, timeZone)).toISOString();
}

/**
 * The instant an operational date is stamped at: midday on that day, agency time.
 *
 * A typed calendar day has to be widened to an instant because the column is a
 * `timestamptz`, and midday is the widest berth on either side of the day it
 * names. Which midday is the whole question. Midday *UTC* has twelve hours of
 * headroom, so it survives every zone strictly inside ±12 and no further: an
 * agency on `Pacific/Auckland` types the 4th, the row is 01:00 on the 5th
 * locally, and the day is read back wrong everywhere.
 *
 * Midday is also, half the time, still ahead — and `validateOperationalDate`
 * refuses an operational date more than the clock-skew tolerance in the future,
 * so a bare midday stamp would reject a collection keyed on the morning it was
 * made. It is clamped to now while now is still on the day that was typed, which
 * is any instant that day and so reads back the same. Past that day the stamp
 * stands: a mistyped future date has to reach the validator that refuses it,
 * not be quietly relabelled as today.
 */
export function operationalDayAsInstant(
	date: string | null | undefined,
	timeZone: string,
	now: Date = getToday(),
): string | null {
	const midday = localTimeAsInstant(date, MIDDAY, timeZone);
	if (midday === null) {
		return null;
	}
	const stillThatDay =
		todayInTimeZone(timeZone, now) === todayInTimeZone(timeZone, new Date(midday));
	return new Date(midday) > now && stillThatDay ? now.toISOString() : midday;
}

/** Midday, as the wall time {@link localTimeAsInstant} takes. */
const MIDDAY = '12:00';

/**
 * A stored instant back as the `HH:MM` a time field holds, on the agency's clock.
 *
 * The inverse of {@link localTimeAsInstant}, and it has to be, or a form loses
 * the time it was given: hydrate in the browser's zone and save in the agency's
 * and an untouched due time drifts by the difference every time the record is
 * opened and saved.
 *
 * Empty rather than a placeholder for an absent or unreadable instant, because
 * that is what an unset time field holds and what the callers already spell.
 */
export function localTimeOfDay(
	// A `Date` as well as an ISO string: a `timestamptz` read through the query
	// seam arrives parsed, and one read off a raw Electric row does not.
	instant: Date | string | null | undefined,
	timeZone: string,
): string {
	if (instant === null || instant === undefined) {
		return '';
	}
	const parsed = new Date(instant);
	if (Number.isNaN(parsed.getTime())) {
		return '';
	}
	return new Intl.DateTimeFormat('en-GB', {
		timeZone: timeZone || undefined,
		hourCycle: 'h23',
		hour: '2-digit',
		minute: '2-digit',
	}).format(parsed);
}

/**
 * The instant whose clock in `timeZone` reads `wall`, where `wall` is that wall
 * time treated as UTC.
 *
 * Two passes, for the reason {@link zonedDayStart} needs them: a zone's offset
 * belongs to an instant, not to the zone, so the offset has to be read at the
 * instant being solved for — which is not known until it has been read. The
 * first pass reads it at the wall time itself and the second at the instant that
 * produced, which is on the correct side of any changeover in between.
 *
 * A pass is right when the clock there reads back the wall time it was asked
 * for, which is what {@link zoneOffsetMs} already measures — no formatting
 * needed, since adding the offset to an instant *is* its wall clock.
 *
 * Neither pass matches where the wall time does not exist: the half-hour a
 * spring-forward skips. The later instant wins there, so a typed 02:30 becomes
 * 03:30 rather than falling back to 01:30 and reading as earlier than what was
 * typed. Both are the same calendar day, which is what the record is dated by.
 */
function instantReading(wall: number, timeZone: string): number {
	const firstPass = wall - zoneOffsetMs(new Date(wall), timeZone);
	const secondPass = wall - zoneOffsetMs(new Date(firstPass), timeZone);
	const reads = (at: number): boolean => at + zoneOffsetMs(new Date(at), timeZone) === wall;

	if (reads(firstPass)) {
		return firstPass;
	}
	if (reads(secondPass)) {
		return secondPass;
	}
	return Math.max(firstPass, secondPass);
}

/**
 * The instant a calendar day began in `timeZone` — the agency's midnight, as UTC.
 *
 * Daylight saving is why this cannot be a subtraction. A zone's offset is not a
 * property of the zone but of the zone *at an instant*: America/New_York is
 * UTC-5 in January and UTC-4 in July, so a bound computed with one offset and
 * applied across a season is an hour wrong for half the year — enough to move
 * an evening's work out of the window that asked for it.
 *
 * So the offset is read at the instant in question, and read twice: once at the
 * wall time treated as UTC, then again at the instant that produced, which is on
 * the correct side of any changeover that happened that day. Either pass can be
 * the right answer, so both are checked against the day they actually land on
 * and the earliest one that lands on the requested day wins.
 *
 * Checking rather than trusting the second pass is what handles a zone that
 * springs forward *at* midnight — Santiago in September. There the requested
 * midnight does not exist, and the second pass reads the post-jump offset and
 * lands an hour into the previous day. The first pass lands on 1am, the first
 * moment the day actually has, which is what a lower bound is asking for.
 */
function zonedDayStart(
	date: string | null | undefined,
	timeZone: string | undefined,
): Date | undefined {
	const parts = calendarDateParts(date);
	if (parts === undefined) {
		return undefined;
	}
	if (timeZone === undefined || timeZone === '') {
		return parseLocalDate(date);
	}
	const wall = Date.UTC(parts.year, parts.month - 1, parts.day);
	const firstPass = wall - zoneOffsetMs(new Date(wall), timeZone);
	const secondPass = wall - zoneOffsetMs(new Date(firstPass), timeZone);
	const wanted = formatCalendarDate(parts);

	const earliest = Math.min(firstPass, secondPass);
	const latest = Math.max(firstPass, secondPass);
	const startsTheDay = (at: number): boolean => todayInTimeZone(timeZone, new Date(at)) === wanted;

	return new Date(startsTheDay(earliest) ? earliest : latest);
}

/** The parts back as the `YYYY-MM-DD` they came from, zero-padded. */
function formatCalendarDate(parts: CalendarDateParts): string {
	const month = `${parts.month}`.padStart(2, '0');
	const day = `${parts.day}`.padStart(2, '0');
	return `${parts.year}-${month}-${day}`;
}

/**
 * How far ahead of UTC `timeZone` was at `instant`, in milliseconds.
 *
 * Derived by asking `Intl` what the wall clock read there and comparing that to
 * the instant itself, because that is the only question the platform answers
 * with the daylight-saving rules already applied. Anything that computes an
 * offset from a zone name alone is wrong twice a year.
 */
function zoneOffsetMs(instant: Date, timeZone: string): number {
	const parts = new Intl.DateTimeFormat('en-US', {
		timeZone,
		hourCycle: 'h23',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
	}).formatToParts(instant);
	const read = (type: Intl.DateTimeFormatPartTypes): number =>
		Number(parts.find((part) => part.type === type)?.value);
	const wallClock = Date.UTC(
		read('year'),
		read('month') - 1,
		read('day'),
		read('hour'),
		read('minute'),
		read('second'),
	);
	return Number.isNaN(wallClock) ? 0 : wallClock - instant.getTime();
}
