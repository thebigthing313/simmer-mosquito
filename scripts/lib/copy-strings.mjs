/**
 * The user-facing copy in a TypeScript or TSX file.
 *
 * A vocabulary rule binds on what a person reads: a label, a filter, a heading,
 * a column, the text between two tags. It does not bind on an identifier, an
 * import path, or a comment. `check-vocabulary.mjs` is the only caller, and what
 * makes that gate usable is that this file answers "what is copy" narrowly
 * rather than grepping the source. About 2,100 comments here said agency when
 * this was written (#534); a gate that read them would have failed on history
 * and been switched off the same day.
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
 * A run of JSX text: the `>` that closed a tag, and the `<` that opens the next
 * one.
 *
 * Both ends are checked, and that is the whole of #588. A bare `>` used to open
 * a run, so an arrow function did too: `.find((person) => person.id === id)`
 * opened at the `=>` and closed at whatever `<` came next, often a generic
 * argument several lines down, and the code in between was read as a sentence.
 * That was written off as free, because "a run is only reported when it holds an
 * avoided word, and an arithmetic comparison does not". It held while the words
 * were `agency` and `tenant`. It stops holding the moment a common English word
 * joins, and `user` is one: two of its four findings were arrow functions.
 *
 * So a `>` after an `=` opens nothing, and the `<` that closes a run has to open
 * a tag: a letter, the `/` of a closing tag, or the `>` of a fragment, which is
 * also what takes `c < d` out. The `>` gets no matching rule of its own, because
 * what precedes it in `<button\n\t\t\t>` is a newline and two tabs, the shape
 * Biome gives every multi-line tag, and a rule tight enough to refuse `a > b`
 * refuses those too.
 */
const JSX_TEXT = /(?<!=)>([^<>{}]+)<(?=[A-Za-z/>])/g;

/**
 * Text between a closing and an opening angle bracket, which is how JSX writes a
 * sentence.
 *
 * Read off the masked source, so a bracket inside a comment or a string cannot
 * open a run. A run holding a brace is dropped: that is an interpolation, and
 * its pieces are read on their own.
 */
function* jsxText(masked) {
	for (const match of masked.matchAll(JSX_TEXT)) {
		if (/[A-Za-z]/.test(match[1])) {
			yield { text: match[1], index: match.index + 1 };
		}
	}
}

/**
 * Every comment this file writes into JSX children, as `{ end, index }` spans.
 *
 * JSX children are text. `//` opens no comment there and `/* *\/` opens none
 * either, so both render on screen, and `masked-source.mjs` has no idea: it
 * blanks them like any other comment, which takes the line out of the copy scan
 * as well as putting it in front of a user. #552 found the second half of that
 * on its own, because a `// vocabulary-ignore` typed into children counts as a
 * marker while a page renders it.
 *
 * Neither half is worth guessing at, so `check-vocabulary.mjs` refuses the shape
 * instead. A comment is in children when it sits inside a run of JSX text that
 * masking left entirely blank, which is a comment on lines of its own between
 * two tags. The run has to be blank because a generic argument opens runs too:
 * `ReadonlySet<Foo>` to the `<` of the next one spans whatever declarations lie
 * between, doc comments included, and 75 of those come out of the app roots
 * against 0 of these.
 *
 * What that costs is a `//` in children sharing its run with anything else: text
 * that renders beside it, or a `{...}` on the line above, which ends the run
 * before the comment starts. Both stay unread.
 */
export function commentsInJsxText(source) {
	const { comments, masked } = scan(source);
	const runs = [...masked.matchAll(JSX_TEXT)]
		.filter((match) => match[1].trim() === '')
		.map((match) => ({ from: match.index + 1, to: match.index + 1 + match[1].length }));

	return comments.filter((comment) =>
		runs.some((run) => comment.index >= run.from && comment.end <= run.to),
	);
}

/**
 * Whether a string literal is copy rather than wiring.
 *
 * A literal is copy unless one of `WIRING` recognizes it. Everything else
 * counts, including a bare one-word label, because that is the shape a heading
 * takes.
 */
const isCopy = (literal) => literal.text.length > 0 && !WIRING.some((is) => is(literal));

/** The four shapes a string literal takes when it is a name rather than words. */
const WIRING = [
	({ before }) => isSpecifier(before),
	({ text }) => isPath(text),
	({ before }) => isWiringAttribute(before),
	({ before }) => isIdentifierConstant(before),
];

const isSpecifier = (before) => /\b(?:from|import|require)\s*\(?\s*$/.test(before);

const isPath = (text) =>
	text.includes('://') || /^[./@]/.test(text) || (text.includes('/') && /^[\w@./-]+$/.test(text));

function isWiringAttribute(before) {
	const attribute = before.match(/([A-Za-z][\w-]*)\s*=\s*\{?\s*$/);
	return attribute !== null && NON_COPY_ATTRIBUTES.has(attribute[1]);
}

/**
 * A constant named `SOMETHING_ID` or `SOMETHING_IDS`, whose value is a name the
 * program uses rather than a word a person reads.
 *
 * The declaration twin of the `id=` already in `NON_COPY_ATTRIBUTES`. Every one
 * of the 40 in the app roots is a Mapbox source or layer id, and six of them
 * spell it `route-sites`, which is what made this worth drawing: adding `site`
 * to `check-vocabulary.mjs` reported all six, and #538 had already ruled the
 * layer ids code rather than copy. A `_ID` constant is an identifier by
 * construction, so the rule cannot swallow a sentence.
 */
const isIdentifierConstant = (before) =>
	/\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*_IDS?\s*=\s*\[?\s*$/.test(before);
