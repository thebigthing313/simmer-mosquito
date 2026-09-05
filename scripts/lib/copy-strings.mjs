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
 * The scan that separates code from comments, strings and regex literals is
 * `masked-source.mjs`, shared with `check-join-types.mjs`. What is left here is
 * the copy question: which string literals are words rather than wiring, and
 * where JSX writes a sentence. The masked source is what the JSX pass reads, so
 * a `<` inside a comment cannot open a run of text.
 */

import { scan } from './masked-source.mjs';

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
