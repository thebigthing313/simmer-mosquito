/**
 * Today, as the calendar day the Organization is currently on, in the
 * `YYYY-MM-DD` shape every date column holds.
 *
 * Here and not inside a weather module because "what day is the Organization
 * on" is not a fact about weather. The summary command handler and the import
 * each carried a private copy of this, and neither had a test (#1083). It
 * imports nothing, so a route, a command handler and a writer can all reach it
 * without a cycle.
 *
 * `instant` names a moment other than now: which calendar day some other
 * instant falls on in the zone, the same question with a different subject.
 * A caller answering "today" passes nothing. The web app's `todayInTimeZone`
 * in `apps/web/src/lib/local-date.ts` has the same signature and the same pin.
 */
export function todayInTimeZone(timeZone: string, instant: Date = new Date()): string {
	// `en-CA` is a format shape rather than a display locale: it is the tag that
	// orders the parts year-month-day, which is the `YYYY-MM-DD` this returns.
	// It is not the `en-US` display pin the web app carries, and swapping it to
	// one would return `03/14/2026` and break every caller.
	return new Intl.DateTimeFormat('en-CA', {
		timeZone,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
	}).format(instant);
}
