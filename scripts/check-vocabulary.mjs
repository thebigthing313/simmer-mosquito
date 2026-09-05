#!/usr/bin/env node
/**
 * Holds user-facing copy to the Avoid lists in `CONTEXT.md`.
 *
 * The Core language table names every domain term and, beside it, the words that
 * are not that term. Nothing read that table until this gate, which is how
 * agency and organization ended up in one sentence on the same screen, and how
 * tenant survived nine lines below the rule banning it. The words are only worth
 * writing down if something checks them.
 *
 * Run it with `pnpm check:vocabulary`.
 *
 * ## The register is `CONTEXT.md`
 *
 * The Avoid lists are parsed out of the table rather than copied into this file.
 * A second copy is a copy, and it would be the one that drifts: the table is
 * what a person edits when the vocabulary changes, and a script nobody opens
 * would keep enforcing last year's words. If the table stops parsing, the gate
 * fails and says so rather than passing over an empty register.
 *
 * ## What it reads
 *
 * User-facing copy in `apps/web/src` and `apps/admin/src`: string literals that
 * are not wiring, and the text between two JSX tags. `CONTEXT.md` says the rule
 * binds on labels, filters, headings and columns, and that lowercase
 * organization in a sentence is not a term, so a comment and an identifier are
 * both out of scope. That is not a softening. There are about 2,100 comments in
 * this workspace saying agency (#534), and a gate that read them would fail on
 * every branch and be switched off within a day. `scripts/lib/copy-strings.mjs`
 * is where the line between copy and wiring is drawn.
 *
 * Matching is on word boundaries, which is what keeps an identifier out on its
 * own account: `\buser\b` does not match `useLiveQuery`, and `\bagency\b` does
 * not match `agency_id` or `agencyName`, because an underscore and a capital are
 * both word characters.
 *
 * ## Two words, not seventeen
 *
 * `ENFORCED` is `agency` and `tenant`. Two words at zero and enforced is worth
 * more than fifteen with an allowance file nobody reads.
 *
 * The rest of the table needs a judgement this gate cannot make. `account` is
 * banned as a name for an Organization or a Profile and is the right word for
 * what a person signs in with, which is the **Account** term; `user`, `login`,
 * `seat` and `zone` are the same shape. A flat word list would report every
 * correct use of Account as a violation. `agency` and `tenant` have no second
 * sense in this product, so they are the two the ban is unconditional on.
 *
 * Widening the list means answering "how do we tell the banned sense from the
 * allowed one" for each word added, not adding a string here.
 *
 * ## The allowance
 *
 * `apps/web/src` is at zero for both words after #489 to #492. `apps/admin/src`
 * still says agency in 63 places, which is #533 and is copy work rather than
 * tooling work, so it is not fixed here. `ALLOWANCE` carries that count and the
 * gate fails when the real number differs in either direction, the same ratchet
 * as `UNCHECKED_ACKNOWLEDGEMENTS` in `apps/server/src/acknowledgements.ts`. Up
 * means a branch wrote new copy; down means a branch fixed some and owes the
 * number.
 *
 * A count rather than a list of allowed sites, deliberately. `CLAUDE.md` warns
 * about a saved allowance that matches nothing: an entry naming a file that has
 * since been cleaned up is headroom a new violation lands inside, silently. A
 * count cannot go stale that way, because there is nothing in it to match. The
 * cost is that the gate cannot say which of the 64 findings is the new one, so
 * on a failure it prints all of them.
 */

import { readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { copyStrings } from './lib/copy-strings.mjs';
import { typeScriptFilesUnder } from './lib/source-files.mjs';

const workspaceRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const REGISTER = join(workspaceRoot, 'CONTEXT.md');

/** The roots holding user-facing copy. The server and the packages ship no screens. */
const COPY_ROOTS = ['apps/web/src', 'apps/admin/src'];

/**
 * The avoided words this gate enforces, out of the register's full lists.
 *
 * Each must appear in some Avoid list in `CONTEXT.md`, and the gate fails if one
 * does not: a word nobody bans any more is a word this should stop checking.
 */
const ENFORCED = ['agency', 'tenant'];

/**
 * Findings this gate tolerates, per root, per word.
 *
 * `apps/admin/src` still calls an Organization an agency throughout its copy.
 * That is #533 and it is a copy change, not a tooling one. The number is exact
 * and the gate fails when the count moves either way, so fixing those strings
 * means editing this number down in the same branch.
 */
const ALLOWANCE = {
	'apps/admin/src': { agency: 63 },
};

/** Below this the table has been reformatted and the parse has stopped working. */
const MINIMUM_TERMS = 12;

function main() {
	const register = readRegister();
	const missing = ENFORCED.filter((word) => !register.avoided.has(word));
	if (missing.length > 0) {
		fail(
			`CONTEXT.md no longer avoids ${missing.join(' or ')}, and this gate still checks for ${missing.length === 1 ? 'it' : 'them'}. Take the word out of ENFORCED in scripts/check-vocabulary.mjs, or put it back in the Avoid column it belongs in.`,
		);
	}

	const findings = COPY_ROOTS.flatMap((root) => scanRoot(root));
	report(findings, register);
}

// ---------------------------------------------------------------------------
// The register
// ---------------------------------------------------------------------------

/**
 * The Core language table: each term, and the words beside it in the Avoid
 * column.
 *
 * Markdown, parsed by splitting a row on its pipes. That holds as long as the
 * table stays a table with a bolded term in the first cell and the Avoid list
 * last. It does not hold through a reformat into prose or a fourth column
 * inserted after the second, and that is what `MINIMUM_TERMS` is for: the gate
 * refuses to run against a register it read almost nothing out of, rather than
 * passing because it found no banned words in an empty list.
 */
function readRegister() {
	const markdown = readFileSync(REGISTER, 'utf8').replace(/\r\n/g, '\n');
	const section = markdown.match(/\n## Core language\n([\s\S]*?)(?=\n## )/);
	if (section === null) {
		fail(`CONTEXT.md has no "## Core language" section, so there is no Avoid list to read.`);
	}

	const rows = section[1].split('\n').map(readRow);
	const terms = new Map(rows.filter((row) => row !== null));

	if (terms.size < MINIMUM_TERMS) {
		fail(
			`read only ${terms.size} terms out of the Core language table in CONTEXT.md, which is fewer than the ${MINIMUM_TERMS} this expects. The table has been reformatted and this gate can no longer see the Avoid lists. Fix the parse in scripts/check-vocabulary.mjs before the vocabulary goes unchecked.`,
		);
	}

	return { terms, avoided: new Set([...terms.values()].flat()) };
}

/**
 * One table row as `[term, avoided words]`, or `null` when the line is not one.
 *
 * A line that is not a table row splits into fewer than three cells and falls
 * out here, which is also what a reformatted table does. `MINIMUM_TERMS` above
 * is what turns that from a silent pass into a failure.
 */
function readRow(line) {
	const cells = line
		.split('|')
		.slice(1, -1)
		.map((cell) => cell.trim());
	const term = cells.length < 3 ? null : cells[0].match(/^\*\*(.+)\*\*$/);
	return term === null ? null : [term[1], avoidedWords(cells.at(-1))];
}

const avoidedWords = (cell) =>
	cell
		.split(',')
		.map((word) => word.trim().toLowerCase())
		.filter((word) => word.length > 0);

// ---------------------------------------------------------------------------
// The copy
// ---------------------------------------------------------------------------

/**
 * An avoided word and the plural of it.
 *
 * "Agencies" on a heading is the same mistake as "Agency", and the register
 * writes the singular. Only the two regular endings, because the enforced words
 * take those and a general pluralizer would be guesswork.
 */
function formsOf(word) {
	const plural = word.endsWith('y') ? `${word.slice(0, -1)}ies` : `${word}s`;
	return [word, plural];
}

const PATTERNS = new Map(
	ENFORCED.map((word) => [word, new RegExp(`\\b(?:${formsOf(word).join('|')})\\b`, 'gi')]),
);

/** Every enforced word in every piece of copy under one root. */
function scanRoot(root) {
	const files = [...typeScriptFilesUnder(join(workspaceRoot, root))];
	return files.flatMap((file) => findingsIn(root, file));
}

function findingsIn(root, file) {
	const source = readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
	const where = relative(workspaceRoot, file).replaceAll('\\', '/');

	return copyStrings(source).flatMap((copy) =>
		avoidedIn(copy.text).map((written) => ({
			root,
			where,
			word: written.word,
			written: written.text,
			line: lineOf(source, copy.index + written.at),
			copy: copy.text.replace(/\s+/g, ' ').trim(),
		})),
	);
}

/**
 * The enforced words one piece of copy says, how it spelled each of them, and
 * where in the copy each sits.
 *
 * The offset is what makes the reported line the line the word is on. A JSX run
 * starts at the `>` that opened it, which is often the line above, and pointing
 * a person at the tag rather than the sentence is how a gate gets a reputation
 * for being wrong.
 */
function avoidedIn(copy) {
	const said = [];

	for (const [word, pattern] of PATTERNS) {
		pattern.lastIndex = 0;
		const written = pattern.exec(copy);
		if (written !== null) {
			said.push({ word, text: written[0], at: written.index });
		}
	}

	return said;
}

const lineOf = (source, index) => source.slice(0, index).split('\n').length;

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

function report(findings, register) {
	const failures = failuresIn(findings);

	if (failures.length === 0) {
		announce(register);
		return;
	}

	for (const failure of failures) {
		printFailure(failure, register);
	}
	process.exit(1);
}

/** Each root and word whose count is not the one checked in, either way. */
function failuresIn(findings) {
	const pairs = COPY_ROOTS.flatMap((root) => ENFORCED.map((word) => ({ root, word })));

	return pairs
		.map(({ root, word }) => ({
			root,
			word,
			allowed: ALLOWANCE[root]?.[word] ?? 0,
			found: findings.filter((entry) => entry.root === root && entry.word === word),
		}))
		.filter(({ allowed, found }) => found.length !== allowed);
}

function announce({ terms }) {
	const allowed = Object.values(ALLOWANCE).flatMap((words) => Object.values(words));
	const total = allowed.reduce((sum, each) => sum + each, 0);
	console.log(
		`check-vocabulary: ${terms.size} terms in CONTEXT.md, ${ENFORCED.length} enforced (${ENFORCED.join(', ')}), ${total} allowed in copy and no more.`,
	);
}

function printFailure(failure, register) {
	const { root, word, allowed, found } = failure;
	const direction = found.length > allowed ? 'more' : 'fewer';

	console.error(
		`check-vocabulary: ${root} has ${count(found.length, 'piece')} of copy saying "${word}", ${direction} than the ${allowed} allowed.\n`,
	);
	for (const entry of found) {
		console.error(`  ${entry.where}:${entry.line}  ${entry.written}: ${trim(entry.copy)}`);
	}
	console.error(`\n${guidance(failure, register)}\n`);
}

/** What to do about one failing count, which depends on which way it moved. */
function guidance({ root, word, allowed, found }, register) {
	if (found.length < allowed) {
		return `That is ${allowed - found.length} fewer than the allowance, so copy has been fixed and the number is stale. Set ALLOWANCE['${root}'].${word} to ${found.length} in scripts/check-vocabulary.mjs.`;
	}

	const write = `CONTEXT.md avoids "${word}" in user-facing copy. Write the term it stands for instead: ${termsAvoiding(register, word)}.`;
	return allowed === 0
		? write
		: `${write}\nThe allowance is a count and not a list, so it cannot point at the new one. It is the line above that was not there before.`;
}

/** The terms whose Avoid list holds this word, for the failure to point at. */
function termsAvoiding({ terms }, word) {
	const naming = [...terms].filter(([, avoided]) => avoided.includes(word)).map(([term]) => term);
	return naming.length > 0 ? naming.join(', ') : 'the term CONTEXT.md names';
}

const trim = (copy) => (copy.length > 100 ? `${copy.slice(0, 100)}...` : copy);

const count = (total, noun) => `${total} ${noun}${total === 1 ? '' : 's'}`;

function fail(message) {
	console.error(`check-vocabulary: ${message}`);
	process.exit(1);
}

main();
