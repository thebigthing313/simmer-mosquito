#!/usr/bin/env node
/**
 * Holds user-facing copy to the words `CONTEXT.md` refuses.
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
 * The refusals are parsed out of the document rather than copied into this file.
 * A second copy is a copy, and it would be the one that drifts: the document is
 * what a person edits when the vocabulary changes, and a script nobody opens
 * would keep enforcing last year's words. If either half stops parsing, the gate
 * fails and says so rather than passing over an empty register.
 *
 * Two halves, because a refused word does not always have a term to sit beside.
 * The Avoid column of the Core language table holds the words that are not some
 * named term, agency and tenant among them. "Site" has no such term: it reads as
 * a Habitat to one person and a Trap to the next, which is the whole reason it
 * is refused, so the table has no row to put it on. Those live in the
 * Ambiguities section and are marked by the words "Not a term".
 *
 * ## What it reads
 *
 * User-facing copy in the three apps that ship screens: string literals that are
 * not wiring, and the text between two JSX tags. `CONTEXT.md` says the rule
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
 * ## Four words, not seventeen
 *
 * `ENFORCED` is `agency`, `tenant`, `site` and `seat`. A word joins when the ban
 * on it is unconditional, or when the exceptions can be named one at a time.
 *
 * `account`, `user` and `login` are not that. `account` is banned as a name for
 * an Organization or a Profile and is the right word for what a person signs in
 * with, which is the **Account** term, and all 22 pieces of copy saying it mean
 * the second one. Enforcing it would mean 22 markers all giving the same reason,
 * which is a list of correct code written out longhand. Widening the list means
 * answering "how do we tell the banned sense from the allowed one" for the word
 * being added, and for those three the answer is still no.
 *
 * ## Markers, not an allowance
 *
 * A word can be right in copy and still be on the list. "Site visits" is the
 * industry name for an outreach method, and the search box matches "site" to
 * Habitats because that is what a person types. Three strings under
 * `apps/web/src` are like that, and they are permanent.
 *
 * The exemption is a comment on the line above, in the shape of a Biome
 * suppression:
 *
 *     // vocabulary-ignore site: the industry name for this outreach method.
 *
 * A count of three excused strings could not say which three or why. A marker
 * puts the reason where the next reader is already looking, and an unused one
 * fails instead of sitting there as headroom the next violation lands inside.
 * That is the failure `CLAUDE.md` warns about under the `fallow` baseline, and a
 * marker cannot have it: every `vocabulary-ignore` in the scanned roots must be
 * one line, well formed, and directly above a piece of copy that says the word
 * it names. Nothing else about it is optional.
 *
 * ### A marker is one line, and says so when it is not
 *
 * #291 is the trap this is written against: a `biome-ignore` whose reason wraps
 * onto a second line silently stops suppressing. Two rules make the same mistake
 * loud here rather than quiet.
 *
 * A reason ends in a full stop, so the first line of a wrapped one fails at the
 * marker, naming the line. And a marker that exempts nothing fails, so a wrapped
 * one whose first line happens to end in a full stop fails anyway, on the line
 * below, with the wrap named as the likely cause. Either way the branch stops
 * and the message says which line to put back together.
 *
 * A third rule is about where the marker sits rather than how it wraps. The line
 * is read off the masked source as well as the source, so the word has to be in
 * a comment: written inside a string literal it exempts nothing, and the string
 * itself is copy that gets reported.
 *
 * One known hole, and it is `masked-source.mjs`'s rather than this file's. A
 * `//` typed into JSX children is read as a comment there, so it does work as a
 * marker, and it also renders on screen for every user of that page. The same
 * masking is why a line of JSX text opening with `//` is invisible to the copy
 * scan at all, marker or not. Nothing has ever written one.
 */

import { readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { copyStrings } from './lib/copy-strings.mjs';
import { maskedSource } from './lib/masked-source.mjs';
import { typeScriptFilesUnder } from './lib/source-files.mjs';

const workspaceRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const REGISTER = join(workspaceRoot, 'CONTEXT.md');

/**
 * The roots holding user-facing copy. The server and the packages ship no
 * screens; `apps/preview` is an internal component gallery and not a product
 * surface. `apps/mobile` ships React Native screens and joined the list in #533,
 * which found the one string on it by hand because nothing was reading them.
 */
const COPY_ROOTS = ['apps/web/src', 'apps/admin/src', 'apps/mobile/src'];

/**
 * The refused words this gate enforces, out of everything the register refuses.
 *
 * Each must be refused somewhere in `CONTEXT.md`, and the gate fails if one is
 * not: a word nobody bans any more is a word this should stop checking.
 */
const ENFORCED = ['agency', 'tenant', 'site', 'seat'];

/** Below this the Core language table has been reformatted and its parse has stopped working. */
const MINIMUM_TERMS = 12;

/** Below this the Ambiguities section has been reformatted and its parse has stopped working. */
const MINIMUM_REFUSED = 2;

/** How a bullet in the Ambiguities section says the word it opens with is refused. */
const REFUSAL = /(?:^|\.\s)Not a term:/;

/** The word that opens a marker, and the token the sweep for a stale one looks for. */
const MARKER_WORD = 'vocabulary-ignore';

function main() {
	const register = readRegister();
	const missing = ENFORCED.filter((word) => !register.avoided.has(word));
	if (missing.length > 0) {
		fail(
			`CONTEXT.md no longer refuses ${missing.join(' or ')}, and this gate still checks for ${missing.length === 1 ? 'it' : 'them'}. Take the word out of ENFORCED in scripts/check-vocabulary.mjs, or put it back in the Avoid column it belongs in.`,
		);
	}

	report(
		COPY_ROOTS.flatMap((root) => scanRoot(root)),
		register,
	);
}

// ---------------------------------------------------------------------------
// The register
// ---------------------------------------------------------------------------

/**
 * What `CONTEXT.md` refuses: the terms and their Avoid lists, the words the
 * Ambiguities section calls "not a term", and the union of both.
 */
function readRegister() {
	const markdown = readFileSync(REGISTER, 'utf8').replace(/\r\n/g, '\n');
	const terms = readTerms(sectionOf(markdown, 'Core language'));
	const refused = readRefused(sectionOf(markdown, 'Ambiguities to preserve'));

	return { terms, refused, avoided: new Set([...[...terms.values()].flat(), ...refused]) };
}

function sectionOf(markdown, heading) {
	const section = markdown.match(new RegExp(`\\n## ${heading}\\n([\\s\\S]*?)(?=\\n## |$)`));
	if (section === null) {
		fail(
			`CONTEXT.md has no "## ${heading}" section, so there is nothing to read the register out of.`,
		);
	}
	return section[1];
}

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
function readTerms(section) {
	const rows = section.split('\n').map(readRow);
	const terms = new Map(rows.filter((row) => row !== null));

	if (terms.size < MINIMUM_TERMS) {
		fail(
			`read only ${terms.size} terms out of the Core language table in CONTEXT.md, which is fewer than the ${MINIMUM_TERMS} this expects. The table has been reformatted and this gate can no longer see the Avoid lists. Fix the parse in scripts/check-vocabulary.mjs before the vocabulary goes unchecked.`,
		);
	}

	return terms;
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

/**
 * The words the Ambiguities section refuses outright, as opposed to the ones it
 * asks you to qualify.
 *
 * Every bullet there opens with a word in quotes. "Application" and
 * "Notification" mean two things and the section says which term to write for
 * each; "District" and "Site" are not terms at all. The sentence "Not a term:"
 * tells those apart, and `MINIMUM_REFUSED` is what stops a rewrite of the
 * section from quietly emptying this half of the register.
 *
 * A whole sentence and not the three words on their own, because the
 * Organization bullet ends "lowercase organization in a sentence is not a term"
 * and means the opposite. Matching that would refuse the word this product is
 * built on.
 */
function readRefused(section) {
	const refused = bulletsIn(section)
		.map((bullet) => (REFUSAL.test(bullet) ? bullet.match(/^"([A-Za-z][\w-]*)"/) : null))
		.filter((quoted) => quoted !== null)
		.map((quoted) => quoted[1].toLowerCase());

	if (refused.length < MINIMUM_REFUSED) {
		fail(
			`read only ${refused.length} refused ${refused.length === 1 ? 'word' : 'words'} out of the Ambiguities to preserve section in CONTEXT.md, which is fewer than the ${MINIMUM_REFUSED} this expects. A bullet there refuses a word by opening with it in quotes and saying "not a term". Fix the parse in scripts/check-vocabulary.mjs, or the wording in CONTEXT.md, before the refusals go unread.`,
		);
	}

	return refused;
}

/** Each `- ` bullet in a markdown section, with its wrapped continuation lines joined on. */
function bulletsIn(section) {
	const bullets = [];
	for (const line of section.split('\n')) {
		readBulletLine(bullets, line);
	}
	return bullets;
}

/** One line of a section: a bullet's first line, its continuation, or neither. */
function readBulletLine(bullets, line) {
	const opened = line.match(/^- (.*)$/);
	if (opened !== null) {
		bullets.push(opened[1]);
		return;
	}
	if (bullets.length > 0 && /^\s+\S/.test(line)) {
		bullets[bullets.length - 1] += ` ${line.trim()}`;
	}
}

// ---------------------------------------------------------------------------
// The copy
// ---------------------------------------------------------------------------

/**
 * A refused word and the plural of it.
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

/** Every finding and every marker under one root. */
function scanRoot(root) {
	return [...typeScriptFilesUnder(join(workspaceRoot, root))].map((file) => readFile(root, file));
}

function readFile(root, file) {
	const source = readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
	const where = relative(workspaceRoot, file).replaceAll('\\', '/');
	const lines = source.split('\n');
	const masked = maskedSource(source).split('\n');

	return {
		root,
		where,
		lines,
		findings: findingsIn(source, where),
		markers: markersIn(lines, masked, where),
	};
}

function findingsIn(source, where) {
	return copyStrings(source).flatMap((copy) =>
		avoidedIn(copy.text).map((written) => ({
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
 * for being wrong. It is also what a marker is measured against, so a run
 * spanning four lines takes its marker above the line holding the word.
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
// The markers
// ---------------------------------------------------------------------------

/**
 * Every marker in one file, well formed or not, and what each one is above.
 *
 * The sweep is for the word `vocabulary-ignore` anywhere in the file rather than
 * for the marker shape, because a marker that does not parse is the case worth
 * catching. Somebody wrote it meaning to exempt something, and a scan that only
 * collected the ones matching the pattern would drop it on the floor and report
 * the copy below as unmarked, with nothing saying why the marker did not count.
 */
function markersIn(lines, masked, where) {
	const claimed = lines.flatMap((line, at) => (line.includes(MARKER_WORD) ? [at] : []));

	return claimed.map((at) => ({
		where,
		line: at + 1,
		target: targetOf(lines, at) + 1,
		...read(lines[at], masked[at]),
	}));
}

/**
 * The line a marker is above: the first one below it that is not another marker.
 *
 * Markers stack, because one line of copy can say two refused words and each
 * needs its own reason. Nothing else may come between: a blank line or an
 * ordinary comment under a marker makes the marker exempt that line instead, and
 * it exempts nothing, which is the failure below.
 */
function targetOf(lines, at) {
	let target = at + 1;
	while (target < lines.length && lines[target].includes(MARKER_WORD)) {
		target += 1;
	}
	return target;
}

/**
 * One marker as `{ word, reason }`, or `{ problem }` saying what is wrong with
 * it.
 *
 * A marker is read off the masked source as well as the source: `masked` holds
 * spaces wherever a comment or a string body was, so a line still carrying
 * letters there is code. That is the marker written inside a string literal,
 * which exempts nothing and is itself copy.
 */
function read(line, masked) {
	if (/[A-Za-z0-9]/.test(masked)) {
		return { problem: 'the word is in code or in a string rather than in a comment' };
	}

	const marker = line.match(new RegExp(`${MARKER_WORD}\\s+(\\S+)\\s*:\\s*(.*)$`));
	if (marker === null) {
		return { problem: `it does not read "${MARKER_WORD} <word>: <reason>"` };
	}

	const word = marker[1];
	const reason = marker[2].replace(/\*\/\s*\}?\s*$/, '').trim();
	return problemWith(word, reason) ?? { word, reason };
}

/** What is wrong with a marker's word or its reason, or `null` when nothing is. */
function problemWith(word, reason) {
	if (!ENFORCED.includes(word)) {
		return {
			problem: `"${word}" is not a word this gate enforces, and ENFORCED holds ${ENFORCED.join(', ')}`,
		};
	}
	if (reason.split(/\s+/).filter((each) => each.length > 0).length < 3) {
		return { problem: 'it carries no reason, and the reason is the point of a marker' };
	}
	if (!reason.endsWith('.')) {
		return {
			problem:
				'its reason does not end in a full stop, which is what the first line of a wrapped reason looks like. A marker is one line',
		};
	}
	return null;
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

function report(files, register) {
	const problems = files.flatMap((file) => problemsIn(file, register));

	if (problems.length === 0) {
		announce(files, register);
		return;
	}

	console.error(problems.join('\n\n'));
	process.exit(1);
}

/** Everything wrong in one file: copy with no marker over it, and markers over nothing. */
function problemsIn(file, register) {
	return [
		...unmarkedIn(file).map((finding) => unmarkedMessage(finding, register)),
		...staleIn(file).map(staleMessage),
	];
}

/** Copy saying a refused word with no marker above the line it is on. */
function unmarkedIn({ findings, markers }) {
	return findings.filter((finding) => !markers.some((marker) => exempts(marker, finding)));
}

/** Every marker that does not exempt a piece of copy, and why it does not. */
function staleIn({ findings, markers, lines }) {
	return markers
		.filter((marker) => !findings.some((finding) => exempts(marker, finding)))
		.map((marker) => ({ ...marker, diagnosis: diagnose(marker, findings, lines) }));
}

/** Whether one marker excuses one finding: same word, and the line right below it. */
const exempts = (marker, finding) => marker.word === finding.word && marker.target === finding.line;

/**
 * Why a marker exempts nothing, when it is otherwise well formed.
 *
 * Two shapes, and they want different sentences. Copy saying the word further
 * down the file means the marker drifted off it, and a wrapped reason is the way
 * that happens: the second line pushes the marker one line too high. Nothing
 * saying the word at all means the copy has been rewritten and the marker is
 * what `CLAUDE.md` calls headroom nothing is using.
 *
 * A marker that did not parse gets none of this. Its own message already says
 * what is wrong with it, and it names no word to look for.
 */
function diagnose(marker, findings, lines) {
	if (marker.problem !== undefined) {
		return null;
	}

	const below = findings.find((finding) => saysBelow(finding, marker));
	if (below === undefined) {
		return `Nothing directly under it says "${marker.word}". Either the copy was fixed and the marker outlived it, or the marker was never over the line it means.`;
	}
	return wrappedOver(lines, marker, below)
		? `Line ${below.line} says "${marker.word}" and a comment line sits between. A marker is one line and sits directly above the copy, so a reason wrapped onto a second one exempts nothing. Put the reason on one line.`
		: `Line ${below.line} says "${marker.word}" and the marker is not the line above it. Move the marker down.`;
}

/**
 * Copy just under a marker that says the marker's word.
 *
 * Two lines and no further. A marker that has missed its copy has missed it by
 * the one line a wrapped reason adds, and searching the rest of the file finds
 * some unrelated string and tells the reader to move the marker onto that.
 */
const saysBelow = (finding, marker) =>
	finding.word === marker.word && finding.line > marker.target && finding.line - marker.target <= 2;

/** Whether what sits between a marker and the copy under it is another comment. */
function wrappedOver(lines, marker, below) {
	const between = lines
		.slice(marker.target - 1, below.line - 1)
		.join('')
		.trim();
	return between.startsWith('//') || between.startsWith('/*');
}

function unmarkedMessage(finding, register) {
	return [
		`check-vocabulary: ${finding.where}:${finding.line} says "${finding.written}" in copy.`,
		'',
		`  ${trim(finding.copy)}`,
		'',
		`CONTEXT.md refuses "${finding.word}" in user-facing copy. ${writeInstead(register, finding.word)}`,
		'If the word is right here, say why on the line above:',
		'',
		`  // ${MARKER_WORD} ${finding.word}: one sentence ending in a full stop.`,
	].join('\n');
}

function staleMessage(marker) {
	const opening =
		marker.problem === undefined
			? `check-vocabulary: ${marker.where}:${marker.line} marks "${marker.word}" and exempts nothing.`
			: `check-vocabulary: ${marker.where}:${marker.line} is not a marker, because ${marker.problem}.`;

	return marker.diagnosis === null ? opening : `${opening}\n\n${marker.diagnosis}`;
}

/**
 * What to write instead of a refused word.
 *
 * A word out of the Core language table names the terms whose Avoid list holds
 * it. One out of the Ambiguities section names no term by definition, which is
 * why it is refused, so it points at the section instead.
 */
function writeInstead({ terms, refused }, word) {
	const naming = [...terms].filter(([, avoided]) => avoided.includes(word)).map(([term]) => term);
	if (naming.length > 0) {
		return `Write the term it stands for: ${naming.join(', ')}.`;
	}
	return refused.includes(word)
		? 'Write the concrete record instead. The "Ambiguities to preserve" section of CONTEXT.md says which.'
		: 'Write the term CONTEXT.md names instead.';
}

function announce(files, { terms, refused }) {
	const markers = files.reduce((total, file) => total + file.markers.length, 0);
	console.log(
		`check-vocabulary: ${terms.size} terms and ${refused.length} refused words in CONTEXT.md, ${ENFORCED.length} enforced (${ENFORCED.join(', ')}), ${count(markers, 'string')} exempted by a marker and no others.`,
	);
}

const trim = (copy) => (copy.length > 100 ? `${copy.slice(0, 100)}...` : copy);

const count = (total, noun) => `${total} ${noun}${total === 1 ? '' : 's'}`;

function fail(message) {
	console.error(`check-vocabulary: ${message}`);
	process.exit(1);
}

main();
