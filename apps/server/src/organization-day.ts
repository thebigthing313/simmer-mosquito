/**
 * Today, as the calendar day the Organization is currently on, in the
 * `YYYY-MM-DD` shape every date column holds.
 *
 * Here and not inside a weather module because "what day is the Organization
 * on" is not a fact about weather. The summary command handler and the import
 * each carried a private copy of this, and the service request nearby window
 * (#1084) is a third caller; one more private copy is the shape this
 * workspace's gates exist to refuse (#1083). It imports nothing, so a route, a
 * command handler and a writer can all reach it without a cycle.
 *
 * `instant` names a moment other than now, which is what a test pins. A
 * caller answering "today" passes nothing.
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
