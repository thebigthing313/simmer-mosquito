/**
 * Display formatters read the same on every machine.
 *
 * The rule is in `CLAUDE.md`: a formatter in `apps/web/src` pins `en-US`, and
 * the two tags in `local-date.ts` that are format shapes rather than reader
 * locales are the exception. Nothing here offers a locale switch, so a formatter
 * passing `undefined` was not serving a preference, it was inheriting whatever
 * the runtime happened to be (#683).
 *
 * Every other suite asserting a formatted string is one CI locale away from
 * failing unless something makes the host disagree with the pin, and no suite
 * can do that by choosing a machine. So this one moves the host: it wraps
 * `Intl.DateTimeFormat`, `Intl.NumberFormat` and the four `toLocale*String`
 * methods so that a call passing no locale gets `de-DE`, and a call passing one
 * is untouched. A formatter that has kept its pin is unmoved and the assertions
 * below read `Aug 4, 2026`; a formatter that drops it renders `4. Aug. 2026`
 * here while still passing on a developer machine, which is the whole failure
 * this file exists to catch.
 *
 * `de-DE` because it moves both halves at once: the month gets a full stop and
 * an ordinal day, and the thousands separator and the decimal point trade
 * places.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatAssignmentDate, formatDueAt } from '../../hooks/queries/assignment-view';
import { formatAmount, formatCount } from '../../lib/format-count';
import { localTimeOfDay, todayInTimeZone } from '../../lib/local-date';
import { formatDate } from '../../routes/-habitat-detail';
import { formatOperationalDate } from '../../routes/operations/-operations-data';
import { formatRequestDate } from '../../routes/public-engagement/-public-engagement-display';

const HOST_LOCALE = 'de-DE';

/** The option set the four date formatters below share, for the two guard cases. */
const DAY: Intl.DateTimeFormatOptions = {
	year: 'numeric',
	month: 'short',
	day: 'numeric',
	timeZone: 'UTC',
};

type Restore = () => void;

/**
 * Make an unpinned call resolve to `HOST_LOCALE` instead of the runner's.
 *
 * The substitution is on the argument, not on the engine: a call that already
 * names a locale is forwarded untouched, so this cannot make a pinned formatter
 * fail and cannot make an unpinned one pass.
 */
function pretendHostLocaleIs(locale: string): Restore {
	const realDateTimeFormat = Intl.DateTimeFormat;
	const realNumberFormat = Intl.NumberFormat;
	const realNumberToLocaleString = Number.prototype.toLocaleString;
	const realDateToLocaleString = Date.prototype.toLocaleString;
	const realDateToLocaleDateString = Date.prototype.toLocaleDateString;
	const realDateToLocaleTimeString = Date.prototype.toLocaleTimeString;

	const intl = Intl as unknown as {
		DateTimeFormat: unknown;
		NumberFormat: unknown;
	};
	// Declarations rather than expressions, and that is load-bearing twice. Both
	// are called with `new`, an arrow is not constructible, and Biome's
	// `useArrowFunction` rewrites a function *expression* into one, so writing
	// either inline turns the substitution into `is not a constructor` on the next
	// `pnpm check:write`. `new` on a function returning an object yields that
	// object, so one declaration serves both call forms.
	function movedDateTimeFormat(
		locales?: Intl.LocalesArgument,
		options?: Intl.DateTimeFormatOptions,
	): Intl.DateTimeFormat {
		return new realDateTimeFormat(locales ?? locale, options);
	}
	function movedNumberFormat(
		locales?: Intl.LocalesArgument,
		options?: Intl.NumberFormatOptions,
	): Intl.NumberFormat {
		return new realNumberFormat(locales ?? locale, options);
	}
	intl.DateTimeFormat = movedDateTimeFormat;
	intl.NumberFormat = movedNumberFormat;

	const numberProto = Number.prototype as unknown as Record<string, unknown>;
	numberProto.toLocaleString = function (
		this: number,
		locales?: Intl.LocalesArgument,
		options?: Intl.NumberFormatOptions,
	): string {
		return realNumberToLocaleString.call(this, locales ?? locale, options);
	};

	const dateProto = Date.prototype as unknown as Record<string, unknown>;
	const substitute = (
		real: (locales?: Intl.LocalesArgument, options?: Intl.DateTimeFormatOptions) => string,
	) =>
		function (
			this: Date,
			locales?: Intl.LocalesArgument,
			options?: Intl.DateTimeFormatOptions,
		): string {
			return real.call(this, locales ?? locale, options);
		};
	dateProto.toLocaleString = substitute(realDateToLocaleString);
	dateProto.toLocaleDateString = substitute(realDateToLocaleDateString);
	dateProto.toLocaleTimeString = substitute(realDateToLocaleTimeString);

	return () => {
		intl.DateTimeFormat = realDateTimeFormat;
		intl.NumberFormat = realNumberFormat;
		numberProto.toLocaleString = realNumberToLocaleString;
		dateProto.toLocaleString = realDateToLocaleString;
		dateProto.toLocaleDateString = realDateToLocaleDateString;
		dateProto.toLocaleTimeString = realDateToLocaleTimeString;
	};
}

describe('a host that is not en-US', () => {
	let restore: Restore;

	beforeEach(() => {
		restore = pretendHostLocaleIs(HOST_LOCALE);
	});

	afterEach(() => {
		restore();
	});

	// The guard on the guard. If the substitution stops working, every assertion
	// below passes for the wrong reason on an en-US runner and this file goes
	// quiet without going green falsely anywhere a reader would notice.
	it('moves a formatter that names no locale', () => {
		expect(new Intl.DateTimeFormat(undefined, DAY).format(Date.UTC(2026, 7, 4))).toBe(
			'4. Aug. 2026',
		);
		expect((14245).toLocaleString()).toBe('14.245');
	});

	it('leaves a formatter that names one alone', () => {
		expect(new Intl.DateTimeFormat('en-US', DAY).format(Date.UTC(2026, 7, 4))).toBe('Aug 4, 2026');
		expect((14245).toLocaleString('en-US')).toBe('14,245');
	});

	it('renders a Habitat date as en-US', () => {
		expect(formatDate('2026-08-04')).toBe('Aug 4, 2026');
	});

	it('renders a mission rain date as en-US', () => {
		expect(formatOperationalDate('2026-08-04')).toBe('Aug 4, 2026');
	});

	it('renders a Service Request date as en-US', () => {
		expect(formatRequestDate('2026-08-04')).toBe('Aug 4, 2026');
	});

	it('renders an assignment date as en-US', () => {
		expect(formatAssignmentDate('2026-08-04')).toBe('Tue, Aug 4, 2026');
	});

	// A due time is an instant on the organization's clock, so the zone is the
	// organization's and only the wording is pinned.
	it('renders a due time as en-US on the organization clock', () => {
		expect(formatDueAt('2026-08-04T20:30:00Z', 'America/New_York')).toBe('Aug 4, 4:30 PM');
	});

	it('separates thousands the en-US way', () => {
		expect(formatCount(14245)).toBe('14,245');
		expect(formatAmount(14245.5)).toBe('14,245.5');
	});

	/**
	 * The two format-shape pins are unmoved for a different reason: neither is a
	 * label, so neither is a display locale to pin. `en-CA` is the tag that
	 * orders the parts year-month-day and `en-GB` the one that yields a bare
	 * `HH:MM`, and swapping either to `en-US` changes what the function returns.
	 */
	it('keeps the format-shape pins on their own tags', () => {
		expect(todayInTimeZone('America/New_York', new Date('2026-08-04T12:00:00Z'))).toBe(
			'2026-08-04',
		);
		expect(localTimeOfDay('2026-08-04T20:30:00Z', 'America/New_York')).toBe('16:30');
	});
});

/**
 * Nothing is patched here, so these read the runner's own host. They are the
 * same assertions and they have to hold either way: a pinned formatter does not
 * know which machine it is on.
 */
describe('the runner as it is', () => {
	beforeEach(() => {
		vi.spyOn(console, 'warn').mockImplementation(() => {});
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('renders the same strings the moved host did', () => {
		expect(formatDate('2026-08-04')).toBe('Aug 4, 2026');
		expect(formatOperationalDate('2026-08-04')).toBe('Aug 4, 2026');
		expect(formatRequestDate('2026-08-04')).toBe('Aug 4, 2026');
		expect(formatAssignmentDate('2026-08-04')).toBe('Tue, Aug 4, 2026');
		expect(formatCount(14245)).toBe('14,245');
	});
});
