/**
 * The line count every static gate's `path:line` message is built from.
 *
 * Nine gates report a finding as a path and a line, and until #767 each counted
 * the line itself. Consolidating those copies is a move rather than a change, so
 * what has to hold is the counting: one-based, newline-separated, and the same
 * answer for an index into a masked copy as for the source it was masked from.
 * A count that shifted by one would move a line number in nine gates at once,
 * several of which are at zero with no allowance list, and the shift would read
 * as the tree having changed rather than as the helper having.
 *
 * Every case passes a source string rather than reading a file, so the source
 * and the expectation sit next to each other.
 */

import { describe, expect, it } from 'vitest';
import { maskedSource } from '../../../../lib/masked-source.mjs';
import { lineOf } from '../../../../lib/source-position.mjs';

/** A three-line source whose offsets are easy to name. */
const source = 'first\nsecond\nthird';

describe('lineOf', () => {
	it('counts the first line as 1', () => {
		expect(lineOf(source, 0)).toBe(1);
		expect(lineOf(source, 4)).toBe(1);
	});

	it('counts a newline as ending the line it sits on', () => {
		expect(lineOf(source, source.indexOf('\n'))).toBe(1);
		expect(lineOf(source, source.indexOf('\n') + 1)).toBe(2);
	});

	it('counts every line of a source', () => {
		expect(lineOf(source, source.indexOf('second'))).toBe(2);
		expect(lineOf(source, source.indexOf('third'))).toBe(3);
		expect(lineOf(source, source.length)).toBe(3);
	});

	it('reads an empty source as line 1', () => {
		expect(lineOf('', 0)).toBe(1);
	});

	it('counts a blank line', () => {
		expect(lineOf('a\n\nb', 3)).toBe(3);
	});

	it('counts a carriage return as part of the line rather than as a break', () => {
		// The workspace is LF, and a CRLF file read as text keeps the `\r`. It is
		// the `\n` that ends a line, so a `\r` in front of one changes no count.
		expect(lineOf('a\r\nb', 3)).toBe(2);
	});

	it('answers the same for a masked copy as for its source', () => {
		// `maskedSource` keeps the length and the newlines of what it masked, which
		// is what lets a gate find a match in the masked copy and report the line in
		// the source. The real scanner rather than a hand-written copy, because the
		// property is the two modules agreeing and a hand-written masked string is
		// one more thing to get wrong.
		const code = "const a = 1;\n// note\nconst b = 'é';\n/* two\nlines */\n";
		const masked = maskedSource(code);
		for (let at = 0; at <= code.length; at += 1) {
			expect(lineOf(masked, at)).toBe(lineOf(code, at));
		}
	});

	it('counts in code units, which is what a match index is', () => {
		// A `match.index` is an offset in code units, so an emoji ahead of the
		// newline moves the offset by two rather than by one. Counting by code
		// point would report the line before it.
		const emoji = '\u{1f99f}\nnext';
		expect(lineOf(emoji, 2)).toBe(1);
		expect(lineOf(emoji, 3)).toBe(2);
	});
});
