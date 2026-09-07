/**
 * One pass over a TypeScript file, blanking out everything that is not code.
 *
 * There is no TypeScript parser here. The workspace is on the native compiler,
 * whose package no longer exposes the JS compiler API, so the gates in this
 * directory read source with regexes. That works as long as they read code and
 * not text that looks like code, which is what this file is for: it walks the
 * source once, tracking whether it is in code, a comment, a string, or a regex
 * literal, and hands back a copy of the source with every comment body, string
 * body and regex body replaced by spaces.
 *
 * The masked copy is the same length as the source and keeps its newlines, so an
 * index into one is an index into the other and a line count still works. What a
 * caller gets out of that is that a `<` inside a comment cannot open a run of
 * JSX text, a `.join(` inside a string is not a call, and a `(` inside a
 * template's fixed text cannot unbalance an argument list. Anything a caller
 * needs the real characters of, such as which join type a call passes, it slices
 * out of the source at the index the masked copy gave it.
 *
 * `copy-strings.mjs` and `check-join-types.mjs` both read it. The first also
 * wants the string literals themselves, so the scan collects them on the way
 * past rather than being run twice.
 *
 * ## Interpolations are walked, not skipped
 *
 * A template literal's `${...}` is code, and code holds strings, comments and
 * regex literals of its own, so the scan runs the same step loop inside one and
 * masks and collects whatever it finds. Skipping it cost two things (#558). A
 * string in an interpolation stayed unmasked and uncollected, so the vocabulary
 * gate never read it and the join gate saw its separator as live punctuation.
 * Worse, the brace match that found the end of the expression ran over the raw
 * source, so a `}` inside a string, a comment or a regex closed the expression
 * early and every character after it in the file was read in the wrong state,
 * with the tail swallowed into one bogus literal and nothing saying so. Nothing
 * in the workspace tripped that, which is why every gate was green. The reason
 * it is fixed rather than noted is that the failure is silent and file-wide.
 *
 * Measured on 2026-09-07, over the three copy roots `check-vocabulary.mjs`
 * reads: the literals collected go from 23,099 to 23,240, which is 121 quoted
 * strings and 20 chunks of a nested template, and the pieces of copy that gate
 * scans go from 12,571 to 12,686. No comment or regex sits inside an
 * interpolation in those roots today, so `comments` does not move. Over
 * everything `sourceFiles` walks, `.join()` calls whose masked argument list
 * holds a top-level comma go from 118 to 102, and `check-join-types.mjs` still
 * reports 88 query-builder joins out of 257 calls: a separator is neither an
 * object literal first nor a function second, so none of the sixteen was ever
 * read as a builder join.
 */

/** Characters after which a `/` opens a regex literal rather than dividing. */
const BEFORE_REGEX = new Set('(,=:[!&|?{};+-*%~^<>\n'.split(''));

/** A string literal's body, sticky, so the scan resumes where it left off. */
const STRING_BODY = {
	"'": /(?:[^'\\\n]|\\.)*/y,
	'"': /(?:[^"\\\n]|\\.)*/y,
};

/** A regex literal's body up to and including its closing slash, character class aware. */
const REGEX_BODY = /(?:[^/\\\n[]|\\.|\[(?:[^\]\\\n]|\\.)*\])*\//y;

/** A template literal's fixed text, stopping at a `${` or the closing backtick. */
const TEMPLATE_CHUNK = /(?:[^`\\$]|\\.|\$(?!\{))*/y;

/** Where a comment that opens with `/` and this character ends. */
const COMMENT_END = {
	'/': (source, at) => indexOrEnd(source, '\n', at),
	'*': (source, at) => Math.min(indexOrEnd(source, '*/', at + 2) + 2, source.length),
};

/**
 * One pass over the file, as `{ comments, literals, masked }`.
 *
 * `masked` is built by code unit rather than by code point, so an index into it
 * is an index into the source and a line count still works either side of an
 * emoji. Each literal carries the 40 characters of source in front of its
 * opening delimiter, which is how a caller tells a module specifier or a
 * `className=` from a sentence.
 *
 * `comments` is every span this blanked as a comment, delimiters included. The
 * walk has no idea what JSX is, so a `//` between two tags is blanked here and
 * renders on screen in the browser; `copy-strings.mjs` reads the spans back to
 * find that (#588).
 *
 * @param {string} source File contents, LF-normalized by the caller.
 */
export function scan(source) {
	const state = { source, comments: [], literals: [], masked: source.split(''), lastCode: '\n' };
	for (let at = 0; at < source.length; ) {
		at = step(state, at);
	}
	return { comments: state.comments, literals: state.literals, masked: state.masked.join('') };
}

/** Just the masked copy, for a caller with no use for the literals. */
export const maskedSource = (source) => scan(source).masked;

/** How far one character of the walk carries us. */
function step(state, at) {
	const read = READERS[state.source[at]];
	const end = read?.(state, at) ?? null;
	if (end !== null) {
		return end;
	}
	state.lastCode = significant(state.source[at], state.lastCode);
	return at + 1;
}

/** The last character that was code, for the regex-or-division question. */
const significant = (character, previous) => (/\S|\n/.test(character) ? character : previous);

/** A comment or a regex literal, both of which are blanked and neither of which is copy. */
function readSlash(state, at) {
	const comment = COMMENT_END[state.source[at + 1]]?.(state.source, at);
	if (comment !== undefined) {
		state.comments.push({ index: at, end: comment });
		return blankThrough(state, at, comment, '/');
	}

	const end = regexEnd(state, at);
	return end === null ? null : blankThrough(state, at, end, '/');
}

function regexEnd(state, at) {
	return BEFORE_REGEX.has(state.lastCode) ? endOfRegex(state.source, at) : null;
}

function endOfRegex(source, start) {
	REGEX_BODY.lastIndex = start + 1;
	return REGEX_BODY.exec(source) === null ? null : REGEX_BODY.lastIndex;
}

/** A `'` or `"` string, whose body is one piece of candidate copy. */
function readQuoted(state, at) {
	const quote = state.source[at];
	STRING_BODY[quote].lastIndex = at + 1;
	STRING_BODY[quote].exec(state.source);
	const end = Math.min(STRING_BODY[quote].lastIndex + 1, state.source.length);
	take(state, at + 1, end - 1, at);
	state.lastCode = quote;
	return end;
}

/**
 * A template literal's fixed chunks, walking the `${...}` expressions between
 * them.
 *
 * The expressions are code, so `${organization.name}` is an identifier and not
 * copy, but code holds strings, comments and regex literals of its own and those
 * are the same kind of thing anywhere else in the file. So the expression is
 * handed to the same step loop the top level runs, which masks and collects
 * whatever it finds and reads a nested template on its own turn.
 */
function readTemplate(state, at) {
	const { source } = state;
	let cursor = at + 1;
	let end = source.length;

	while (cursor < source.length) {
		TEMPLATE_CHUNK.lastIndex = cursor;
		TEMPLATE_CHUNK.exec(source);
		end = TEMPLATE_CHUNK.lastIndex;
		take(state, cursor, end, cursor - 1);
		if (source[end] !== '$') {
			break;
		}
		cursor = readExpression(state, end + 2);
	}

	state.lastCode = '`';
	return Math.min(end + 1, source.length);
}

/**
 * The index past the `}` closing a `${` expression, having walked what is inside
 * it.
 *
 * Depth is counted on the characters the step loop did not hand to a reader,
 * which is the whole of why this walks rather than matching braces. A `}` inside
 * a string, a comment or a regex is consumed by that reader and never seen here,
 * so it cannot close the expression. Matching braces over the raw source counted
 * every one of them, and a hidden `}` ended the template early and left the rest
 * of the file read in the wrong state, with the tail swallowed into one bogus
 * literal and nothing saying so (#558).
 *
 * The expression opens where a regex may begin, so `lastCode` is set to the `{`
 * the caller stepped past: `${/[}]/.test(x)}` divides nothing.
 */
function readExpression(state, from) {
	state.lastCode = '{';
	let depth = 1;

	for (let at = from; at < state.source.length; ) {
		const character = state.source[at];
		const next = step(state, at);
		depth += BRACE_DEPTH[character] ?? 0;
		if (depth === 0) {
			return next;
		}
		at = next;
	}
	return state.source.length;
}

/** What a brace the step loop did not hand to a reader does to the expression's depth. */
const BRACE_DEPTH = { '{': 1, '}': -1 };

const READERS = {
	'/': readSlash,
	"'": readQuoted,
	'"': readQuoted,
	'`': readTemplate,
};

/**
 * Record a string literal and blank it out of the masked source.
 *
 * `opensAt` is the delimiter the body sits behind, not the body's own start, so
 * the text kept as `before` stops short of the quote. That is what lets a caller
 * see `className=` where a body-relative slice would see `className="`.
 */
function take(state, from, to, opensAt) {
	state.literals.push({
		text: state.source.slice(from, to),
		index: from,
		before: state.source.slice(Math.max(0, opensAt - 40), opensAt),
	});
	blank(state, from, to);
}

/** Replace a span with spaces, keeping the newlines so line counts still work. */
function blank(state, from, to) {
	const blanked = state.source.slice(from, to).replace(/[^\n]/g, ' ');
	for (let at = 0; at < blanked.length; at += 1) {
		state.masked[at + from] = blanked[at];
	}
}

function blankThrough(state, from, to, lastCode) {
	blank(state, from, to);
	state.lastCode = lastCode;
	return to;
}

function indexOrEnd(source, needle, from) {
	const found = source.indexOf(needle, from);
	return found === -1 ? source.length : found;
}
