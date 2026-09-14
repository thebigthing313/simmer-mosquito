/**
 * What a formatter answers when it cannot read what it was handed.
 *
 * A formatter here is total: it takes a `string` or a `number` and returns a
 * `string`, on every screen, for every row. So the question is not whether to
 * fail but what a failure looks like, and #609 found five answers to it across
 * sixteen formatters: the em dash, the input echoed back, `Unknown`, `NaN`, and
 * a `RangeError` thrown into the render tree.
 *
 * ## The rule
 *
 * The value goes back on screen and a warning goes to the console, naming the
 * formatter and the value. Both halves matter.
 *
 * The value, because a cell has to hold something and the raw value is the only
 * thing left that is true. It is also a clue: a reader who sees `04/08/2026`
 * where a date belongs can say what went wrong, where `Unknown` and a dash say
 * only that something did.
 *
 * Not the em dash, which is the one answer this forbids. #584 gave that glyph to
 * absence and `AbsentValue` in `packages/ui-web` draws it, so a formatter that
 * renders it for a failed read makes a broken column look like an empty one. The
 * eight formatters that did read as a sparse record with nothing logged.
 *
 * The warning, because nobody has measured whether any of these ever fire.
 * Every column reaching a date formatter is declared `z.string()` on the sync
 * path, so a hit means a bad row or a REST subset read handing over something
 * else, and neither is a thing a screen can report. This is the pattern
 * `lib/acknowledgement-copy.ts` already uses for an unmapped acknowledgement
 * flag: warn where a developer sees it, keep a fallback on screen.
 *
 * ## Once
 *
 * Keyed by the formatter and the value together. A date column that fails fails
 * on every row, and five hundred identical lines is a console nobody reads. Two
 * bad values, or one bad value reaching two formatters, are two separate facts
 * and warn separately.
 *
 * The set is never cleared. A page that renders the same bad row again has
 * nothing new to say, and the developer who needs the line has it already. It
 * outlives a test too, so a case asserting the warning fired has to pass a value
 * no other case in its file passed to the same formatter.
 *
 * ## Naming the formatter
 *
 * The name is a string the caller writes rather than `fn.name`, because a
 * formatter reached through a shared helper would report the helper. That makes
 * it the caller's job to be unambiguous, and the parenthesis in
 * `formatDate (weather summary)` is what that looks like. Three modules exported
 * a `formatDate` when this was written; one is `formatNumericDate` now (#906)
 * and one folded into `formatListDate` (#916), so the ambiguity the parenthesis
 * answers is gone for the moment rather than settled, `formatDate` being a name
 * any screen can take back. A line naming a function three modules answer to is
 * a line that has not said anything.
 */

/** Every formatter and value pair already reported, so each is reported once. */
const reported = new Set<string>();

/**
 * The rule, for a formatter whose answer is a string: warn, and hand the value
 * back.
 *
 * `String(value)` rather than the value itself so a number formatter can use it
 * too. A non-finite number reads as `NaN` or `Infinity`, which is what those
 * formatters already put on screen, and is as close to "as it arrived" as a
 * number gets.
 */
export function unreadable(formatter: string, value: string | number): string {
	warnUnreadable(formatter, value);
	return String(value);
}

/**
 * The same warning, for a formatter that cannot return a string.
 *
 * `dayOfMonth` answers a number, so it takes the warning without the echo and
 * picks its own fallback. Nothing else needs this.
 */
export function warnUnreadable(formatter: string, value: string | number): void {
	// A space separates them and cannot collide: a formatter name is written here
	// by hand, and every one of them is an identifier.
	const key = `${formatter} ${String(value)}`;
	if (reported.has(key)) {
		return;
	}
	reported.add(key);
	console.warn(
		`${formatter} could not read ${JSON.stringify(String(value))}. Showing it as it arrived.`,
	);
}
