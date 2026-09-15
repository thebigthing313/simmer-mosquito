/**
 * The identifiers in a masked source, and the parts each one is spelled from.
 *
 * `check-vocabulary.mjs` holds copy to the words `CONTEXT.md` refuses, and #955
 * widened it to identifiers: `siteLabel` lived in three modules under a green
 * gate, because the copy scan reads string literals and JSX text and a word
 * boundary is exactly what keeps an identifier out of it. The question this
 * module answers is the one the copy scan cannot: does one of the parts an
 * identifier is built from spell a refused word.
 *
 * ## An identifier is a token, and the source is the masked copy
 *
 * There is no TypeScript parser under `scripts/`, so an identifier is what the
 * token rule says it is: a run of letters, digits, underscores and dollars that
 * does not open with a digit, read off the copy `masked-source.mjs` hands back
 * with every comment, string and regex body blanked. That is what keeps a word
 * in a docblock or a label out, and it is also what puts every kind of name in:
 * a declaration, a property key, a parameter, a type, a JSX attribute and a
 * keyword are all tokens. No keyword is a refused word, and a property key is
 * deliberately in rather than out, because `{ site: habitat.name }` is the
 * shape a rename reaches for first. What the rule cannot tell apart is a key
 * that is a column, which a rename turns into a migration; `packages/db/
 * schema.sql` names no column on any enforced word, measured when this was
 * written, so today that is no identifier at all.
 *
 * ## A part is what a case convention separates
 *
 * `partsOf` splits on the three conventions the workspace writes and on digits:
 * `HabitatSite` is `Habitat` and `Site`, `user_id` is `user` and `id`,
 * `useLiveQuery` is `use`, `Live` and `Query`, `SCREAMING_SNAKE` is two parts,
 * and `md5Site` is `md`, `5` and `Site`. A run of capitals holds together until
 * the capital that opens a lower-case tail, so `XMLHttpRequest` is `XML`, `Http`
 * and `Request` rather than four single letters. Parts compare lower-cased, so
 * the case a convention gave a part is not what decides a match.
 *
 * A part is the whole word and not a prefix of one: `useLiveQuery` does not say
 * `user` and `website` does not say `site`. That is stricter than the copy
 * scan's word boundary on purpose, and it is the whole reason a second rule
 * exists rather than the copy pattern being run over identifiers: `agency_id`
 * is what the identifier scan is for, and `\bagency\b` cannot see it.
 */

/** One identifier token, anywhere in a masked source. */
const IDENTIFIER = /[A-Za-z_$][A-Za-z0-9_$]*/g;

/**
 * One part of an identifier: a run of capitals not followed by a lower-case
 * letter, a capitalized or lower-case word, or a run of digits.
 */
const PART = /[A-Z]+(?![a-z])|[A-Z]?[a-z]+|\d+/g;

/**
 * Every identifier in a masked source, with the index it starts at.
 *
 * The index is into the masked copy, which is the same length as the source it
 * was masked from, so a caller reports a line off the source with it.
 *
 * @param {string} masked A source with comment, string and regex bodies blanked.
 * @returns {Array<{ name: string, index: number }>}
 */
export function identifiersIn(masked) {
	return [...masked.matchAll(IDENTIFIER)].map((match) => ({
		name: match[0],
		index: match.index,
	}));
}

/**
 * The parts one identifier is spelled from, in order, case as written.
 *
 * @param {string} name
 * @returns {string[]}
 */
export function partsOf(name) {
	return name.split(/[_$]+/).flatMap((chunk) => chunk.match(PART) ?? []);
}

/**
 * Whether one of an identifier's parts is exactly `word`, compared lower-cased.
 *
 * @param {string} name
 * @param {string} word A lower-case word.
 */
export function spells(name, word) {
	return partsOf(name).some((part) => part.toLowerCase() === word);
}
