/**
 * The user-facing copy in a TypeScript or TSX file.
 *
 * A vocabulary rule binds on what a person reads: a label, a filter, a heading,
 * a column, the text between two tags. It does not bind on an identifier, an
 * import path, or a comment. `check-vocabulary.mjs` is the only caller, and what
 * makes that gate usable is that this file answers "what is copy" narrowly
 * rather than grepping the source. About 2,100 comments in this workspace say
 * agency (#534); a gate that read them would fail on history and be switched off
 * the same day.
 *
 * There is no TypeScript parser here. The workspace is on the native compiler,
 * whose package no longer exposes the JS compiler API, so the gates in this
 * directory read source with regexes. The scanner below is the part that has to
 * be right: it walks the file once, tracking whether it is in code, a comment, a
 * string, or a regex literal, and hands back the string literals plus a masked
 * copy of the source with every comment body and string body blanked out. The
 * masked copy is what the JSX pass reads, so a `<` inside a comment cannot open
 * a run of text.
 */

/** Characters after which a `/` opens a regex literal rather than dividing. */
const BEFORE_REGEX = new Set('(,=:[!&|?{};+-*%~^<>\n'.split(''));

/** Attributes whose value is wiring rather than words. */
const NON_COPY_ATTRIBUTES = new Set([
	'accessorKey',
	'align',
	'as',
	'class',
	'className',
	'data-testid',
	'field',
	'form',
	'from',
	'href',
	'htmlFor',
	'id',
	'key',
	'name',
	'role',
	'side',
	'size',
	'sortKey',
	'src',
	'testId',
	'to',
	'type',
	'value',
	'variant',
]);

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
 * Every piece of copy in one file, as `{ text, index }` into the source.
 *
 * Two kinds go in: a string literal that is not wiring, and the text between a
 * closing and an opening angle bracket, which is how JSX writes a sentence. A
 * template literal contributes its fixed chunks and not its expressions.
 *
 * @param {string} source File contents, LF-normalized by the caller.
 */
export function copyStrings(source) {
	const { literals, masked } = scan(source);
	return [...literals.filter(isCopy), ...jsxText(masked)];
}

// ---------------------------------------------------------------------------
// The scan
// ---------------------------------------------------------------------------

/**
 * One pass over the file.
 *
 * `masked` is built by code unit rather than by code point, so an index into it
 * is an index into the source and a line count still works either side of an
 * emoji.
 */
function scan(source) {
	const state = { source, literals: [], masked: source.split(''), lastCode: '\n' };
	for (let at = 0; at < source.length; ) {
		at = step(state, at);
	}
	return { literals: state.literals, masked: state.masked.join('') };
}

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
	const end = COMMENT_END[state.source[at + 1]]?.(state.source, at) ?? regexEnd(state, at);
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
 * A template literal's fixed chunks, skipping `${...}` and anything nested in it.
 *
 * The expressions are code, so `${agency.name}` is an identifier and not copy,
 * and a nested template inside one is read by the walk on its own turn.
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
		cursor = skipExpression(source, end + 2);
	}

	state.lastCode = '`';
	return Math.min(end + 1, source.length);
}

/** The index past the `}` closing a `${` expression, counting nested braces. */
function skipExpression(source, from) {
	const braces = /[{}]/g;
	braces.lastIndex = from;
	let depth = 1;

	for (let brace = braces.exec(source); brace !== null; brace = braces.exec(source)) {
		depth += brace[0] === '{' ? 1 : -1;
		if (depth === 0) {
			return braces.lastIndex;
		}
	}
	return source.length;
}

const READERS = {
	'/': readSlash,
	"'": readQuoted,
	'"': readQuoted,
	'`': readTemplate,
};

// ---------------------------------------------------------------------------
// The masked copy
// ---------------------------------------------------------------------------

/**
 * Record a candidate piece of copy and blank it out of the masked source.
 *
 * `opensAt` is the delimiter the body sits behind, not the body's own start, so
 * the text kept as `before` stops short of the quote. That is what lets
 * `isWiringAttribute` see `className=` where a body-relative slice would see
 * `className="`.
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

// ---------------------------------------------------------------------------
// What counts as copy
// ---------------------------------------------------------------------------

/**
 * Text between a closing and an opening angle bracket, which is how JSX writes a
 * sentence.
 *
 * Read off the masked source, so a bracket inside a comment or a string cannot
 * open a run. A run holding a brace is dropped: that is an interpolation, and
 * its pieces are read on their own.
 *
 * This also matches things that are not JSX, `a > b && c < d` among them. That
 * costs nothing. A run is only reported when it holds an avoided word, and an
 * arithmetic comparison does not.
 */
function* jsxText(masked) {
	for (const match of masked.matchAll(/>([^<>{}]+)</g)) {
		if (/[A-Za-z]/.test(match[1])) {
			yield { text: match[1], index: match.index + 1 };
		}
	}
}

/**
 * Whether a string literal is copy rather than wiring.
 *
 * Three kinds are dropped: a module specifier, a URL or path, and the value of
 * an attribute that carries no words. Everything else counts, including a bare
 * one-word label, because that is the shape a heading takes.
 */
function isCopy({ text, before }) {
	return text.length > 0 && !isSpecifier(before) && !isPath(text) && !isWiringAttribute(before);
}

const isSpecifier = (before) => /\b(?:from|import|require)\s*\(?\s*$/.test(before);

const isPath = (text) =>
	text.includes('://') || /^[./@]/.test(text) || (text.includes('/') && /^[\w@./-]+$/.test(text));

function isWiringAttribute(before) {
	const attribute = before.match(/([A-Za-z][\w-]*)\s*=\s*\{?\s*$/);
	return attribute !== null && NON_COPY_ATTRIBUTES.has(attribute[1]);
}
