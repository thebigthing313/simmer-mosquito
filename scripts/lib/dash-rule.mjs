/**
 * The dash rule in `docs/writing-style.md`, and the two gates that hold it.
 *
 * One rule, two corpora. `check-prose.mjs` reads every tracked `.md` and
 * `check-copy-dashes.mjs` reads the copy in the apps that ship screens, and
 * they were never going to be one gate: a masker, a file listing and a marker
 * syntax are all corpus shaped, and pointing either at the other's corpus means
 * rewriting all three. What they can share is the rule itself, which is a
 * character, the sentence in the document that bans it, and the message a
 * reader gets when it turns up.
 *
 * Sharing it is not tidying. The rule is written down in exactly one place, the
 * document, and a gate that carried its own second copy would be the copy that
 * drifts. Two gates carrying two second copies is the same failure twice.
 *
 * `applies` is not here, because it is the whole of what differs. A dash on a
 * wrapped markdown line has whitespace against it where a template's fixed
 * chunk has an interpolated value, and a standalone glyph is a UI symbol in an
 * app and nothing in particular in a document.
 */

import { readFileSync } from 'node:fs';

import { trim } from './style-gate.mjs';

/** The em dash, which no sentence may carry, and which a gate also compares against. */
export const EM_DASH = '—';

/** The en dash, which no sentence may carry between spaces. */
const EN_DASH = '–';

/**
 * The dashes, and the sentence each has to still be banned by.
 *
 * Each pattern is built from the character above rather than written out beside
 * it, because a file arguing that a rule belongs in one place should not write
 * the rule's one character twice.
 *
 * `says` is what the register has to carry for the rule to be enforced at all.
 * `advice` is per gate, because what to write instead of a dash depends on what
 * the writer is writing: an app has `AbsentValue` for the one case the ban does
 * not reach, and a document does not.
 */
export const DASHES = {
	em: {
		name: 'em dash',
		label: 'an em dash',
		pattern: new RegExp(EM_DASH, 'g'),
		says: /No em dashes\./,
	},
	en: {
		name: 'spaced en dash',
		label: 'a spaced en dash',
		pattern: new RegExp(EN_DASH, 'g'),
		says: /an en dash trades one tell for another/,
	},
};

/**
 * That `docs/writing-style.md` still says what a gate enforces.
 *
 * The document is the register and a gate is a reader. A rule enforced in a
 * script and gone from the document is a rule nobody agreed to, and the branch
 * that deletes the sentence should be the branch that changes the check.
 *
 * Whitespace is collapsed first, because the document is wrapped at 80 and
 * every sentence looked for here spans two lines.
 *
 * @param {string} register Path to `docs/writing-style.md`.
 * @param {Array<{ name: string, says: RegExp }>} rules
 * @returns {string[]} The names of the rules the document no longer states.
 */
export function unstatedRules(register, rules) {
	const document = readFileSync(register, 'utf8').replace(/\s+/g, ' ');
	return rules.filter((rule) => !rule.says.test(document)).map((rule) => rule.name);
}

/** The rules a summary line or a failure names, read as one phrase. */
export const names = (rules) => rules.map((rule) => rule.name).join(' and ');

/**
 * What a reader gets for a dash nothing excuses.
 *
 * The line is quoted rather than the finding, because the reported line is the
 * one the dash is on and a template's fixed chunk quoted on its own is often
 * one character wide.
 *
 * @param {string} gate The gate's name, which opens every line it prints.
 * @param {string} example A well-formed marker, for a reader who needs one.
 */
export const unmarkedMessage = (gate, example) => (finding, lines) =>
	[
		`${gate}: ${finding.where}:${finding.line}:${finding.column} writes ${finding.rule.label}.`,
		'',
		`  ${trim(lines[finding.line - 1].trim())}`,
		'',
		`docs/writing-style.md bans it. ${finding.rule.advice}`,
		'If the dash is right here, say why on the line above:',
		'',
		`  ${example}`,
	].join('\n');
