/**
 * The five display-formatter calls, and whether each pins its locale tag.
 *
 * `check-formatter-locales.mjs` reads the tree through this, and its `PROBES`
 * hold one source per shape at run time; the suite at
 * `scripts/src/tests/unit/lib/formatter-locales.test.ts` holds the rest of the
 * table. The reader is its own module so the suite can reach it without
 * spawning the gate, which is the split `fallow-comparison.mjs` made for the
 * same reason.
 *
 * ## What a call is
 *
 * `Intl.DateTimeFormat(`, `Intl.NumberFormat(`, `.toLocaleString(`,
 * `.toLocaleDateString(` and `.toLocaleTimeString(`, found on the masked copy
 * of the source so a call named in a comment or a string is prose. The `(` is
 * part of the match, which is what keeps `Intl.DateTimeFormatOptions` in a type
 * position and `Intl.DateTimeFormat.supportedLocalesOf(` out of it, and the
 * three method names are matched whole, so `toLocaleLowerCase(` and
 * `toLocaleUpperCase(` are not read: neither takes options and neither draws a
 * date or a number.
 *
 * ## What a pinned tag is
 *
 * The first argument, read to the first comma or closing paren at the call's
 * own depth, is a string literal whose body is not empty and is not `default`.
 * Every other first argument is a finding, each with its own sentence: absent,
 * because the runtime locale is what a call with no argument gets; `undefined`
 * and `'default'`, which are the same thing spelled out; the empty string,
 * which every formatter refuses with a `RangeError`; and anything else, an
 * identifier, a member, a template or a spread, because a tag that arrives
 * through a variable is one this cannot read and #1128 decided against reading
 * it. A helper taking a tag is the case to argue for on the branch that writes
 * one.
 *
 * The argument's shape is read off the masked copy, where a string literal is
 * its two quotes with spaces between, and its text off the source at the same
 * offset, which is `check-session-credentials.mjs`'s split: a comment inside
 * the argument list is blanked before the scan reaches it, and the tag itself
 * is read where it was written.
 */

import { maskedSource } from './masked-source.mjs';

/** The five calls, with the `(` in the match so a type or a static member is not one. */
const FORMATTER_CALL =
	/\b(Intl\.DateTimeFormat|Intl\.NumberFormat)\s*\(|\.(toLocaleString|toLocaleDateString|toLocaleTimeString)\s*\(/g;

/** A string literal on the masked copy, where the body has been blanked to spaces. */
const MASKED_LITERAL = /^(['"])\s*\1$/;

/** What a bracket does to the depth of an argument list. */
const BRACKET_DEPTH = { '(': 1, '[': 1, '{': 1, ')': -1, ']': -1, '}': -1 };

/** The tag that names the runtime locale rather than one. */
const RUNTIME_LOCALE = new Set(['default']);

/**
 * Every display-formatter call in one source, in order.
 *
 * @param {string} source File contents, LF-normalized by the caller.
 * @returns {{ form: string, index: number, argument: string, problem: string | null }[]}
 */
export function formatterCalls(source) {
	const masked = maskedSource(source);

	return [...masked.matchAll(FORMATTER_CALL)].map((match) => {
		const form = match[1] ?? match[2];
		const index = match.index + (match[1] === undefined ? 1 : 0);
		const span = firstArgument(masked, match.index + match[0].length);
		const argument = collapse(source.slice(span.start, span.end));
		return {
			form,
			index,
			argument,
			problem: problemFor(masked.slice(span.start, span.end), argument),
		};
	});
}

/**
 * Where the first argument sits, trimmed, as `{ start, end }`.
 *
 * Depth is counted on the masked copy, so a comma inside a nested call or an
 * object literal does not end the argument and one inside a string cannot.
 */
function firstArgument(masked, from) {
	let depth = 0;
	let at = from;

	for (; at < masked.length; at += 1) {
		const character = masked[at];
		if (depth === 0 && (character === ',' || character === ')')) {
			break;
		}
		depth += BRACKET_DEPTH[character] ?? 0;
	}

	return trimmed(masked, from, at);
}

/** A span with the whitespace either side taken off. */
function trimmed(text, start, end) {
	let from = start;
	let to = end;
	while (from < to && /\s/.test(text[from])) {
		from += 1;
	}
	while (to > from && /\s/.test(text[to - 1])) {
		to -= 1;
	}
	return { start: from, end: to };
}

/** The argument as one line, for a message. */
const collapse = (text) => text.replace(/\s+/g, ' ');

/**
 * What is wrong with one first argument, or `null` when it is a literal tag.
 *
 * The shape is read off the masked copy, where a literal is its two quotes with
 * the body blanked to spaces, so a call with no argument, an `undefined` and an
 * expression are told apart without reading the text. The text is read for the
 * two things the shape cannot say: an empty body, which is two quotes and
 * nothing between, and `'default'`, which is a body only the source spells.
 */
function problemFor(maskedArgument, argument) {
	if (maskedArgument === '') {
		return 'passes no locale tag';
	}
	if (maskedArgument === 'undefined') {
		return 'passes undefined, which is the runtime locale';
	}
	if (!MASKED_LITERAL.test(maskedArgument)) {
		return `passes ${argument}, which is not a string literal`;
	}
	const body = argument.slice(1, -1);
	if (body === '') {
		return 'passes an empty string, which is no tag';
	}
	return RUNTIME_LOCALE.has(body) ? `passes ${argument}, which is the runtime locale` : null;
}
