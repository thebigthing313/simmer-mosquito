#!/usr/bin/env node
/**
 * Holds the markdown in this workspace to the dash rule in
 * `docs/writing-style.md`.
 *
 * Biome checks zero markdown files. `biome check` on a `.md` answers `Checked 0
 * files`, so `pnpm check` has never read a word of prose, and the one style
 * rule with a machine-checkable shape held only as far as whoever was reading.
 * Fourteen em dashes were sitting in five documents under `docs/` when #594 was
 * filed, put there over months by agents that had all been handed the rule.
 *
 * Run it with `pnpm check:prose`.
 *
 * ## Two rules, and why not more
 *
 * `docs/writing-style.md` is mostly judgement: puffery, false ranges, one idea
 * per sentence, "would this sentence read the same in another project's docs".
 * None of that is a regular expression, and a gate that guessed at it would be
 * wrong often enough to be switched off. The dash is the exception. It is a
 * character, the rule against it is unconditional, and the document says what
 * to write instead.
 *
 * The en dash is here because the rule names it: swapping one in "trades one
 * tell for another". Only a spaced one, because an unspaced en dash is a range
 * and correct. `1.04–1.62:1` in `scripts/map-style/README.md` and `` `a`–`z` ``
 * in `docs/organization-settings-domain.md` are both right, and neither needs a
 * marker to stay. That distinction is what keeps this gate at zero with no
 * allowance list.
 *
 * ## What it reads, and what it does not
 *
 * Every tracked `.md` file except the generated ones. `CHANGELOG.md` is written
 * by `changeset version` out of changeset bodies, and `.changeset/README.md`
 * ships with the tool; rewriting either would edit published history to satisfy
 * a style rule. The 37 dashes in those three files stay where they are.
 *
 * The list comes from `git ls-files` rather than a directory walk, because a
 * walk from the workspace root descends into `.claude/worktrees`, where an
 * agent checkout of this same repository sits on somebody else's branch. A gate
 * that reads those fails on prose that is not on the branch being checked. The
 * cost is that a `.md` file nobody has added yet is not read, which shows up
 * the moment it is committed.
 *
 * Code comments are out, and that is a measurement rather than a preference.
 * The workspace carries 3,059 em dashes in `.ts`, `.tsx` and `.mjs` sources,
 * 2,265 of them under `apps/`. A gate reading those would fail on every branch
 * and be gone within a day, which is the same reason `check:vocabulary` reads
 * copy and not comments. Prose documents were 64 dashes across seven files and
 * are now zero, so this is the half that can be held at zero today. Widening it
 * to comments is a sweep, not a flag.
 *
 * ## What it masks
 *
 * A fenced code block and an inline code span are literals, not prose. A dash
 * inside either is a string somebody has to type exactly, and the mask is what
 * lets `docs/releases.md` write out a stamped changelog heading without this
 * gate reading it as a sentence. Masking preserves line and column, so a
 * reported position is the position in the file.
 *
 * A table's `---` separator row needs nothing: this reads U+2014 and U+2013, and
 * a row of hyphens is neither.
 *
 * ## Markers, not an allowance
 *
 * A dash can be right and still be caught, and the exemption is an HTML comment
 * on the line above, in the shape `check:vocabulary` uses:
 *
 *     <!-- prose-ignore: quoting the heading changeset writes. -->
 *
 * It carries the same two rules for the same reason. The reason ends in a full
 * stop, and a marker that exempts nothing fails. An unused marker is headroom
 * the next violation lands inside, which is the failure `CLAUDE.md` describes
 * under the `fallow` baseline, and a count of excused lines could not say which
 * or why.
 *
 * One shape a marker cannot take: a comment line inside a markdown table ends
 * the table. A dash in a table cell has to be fixed rather than excused, and
 * the one that was there, an em dash standing for "nothing" in a Replaces
 * column, read better as a word anyway.
 *
 * A document naming the marker writes it in backticks, and `CLAUDE.md` and
 * `docs/writing-style.md` both do. The sweep reads the masked line, so a
 * mention inside a code span is not a marker and does not have to excuse
 * anything.
 *
 * ## The floors
 *
 * #591's lesson, twice. `MINIMUM_RULES` fails when a rule is dropped from
 * `RULES`, and `MINIMUM_FILES` fails when the listing stops finding files,
 * which is what a wrong exclusion or a moved directory looks like from here.
 * Without them a gate that has stopped checking anything still exits 0 and
 * prints a summary line that reads like a pass.
 *
 * The rule itself is read back out of `docs/writing-style.md` rather than only
 * living here. If that document stops banning the dash, this fails and says to
 * take the rule out, the same way `check:vocabulary` fails when `CONTEXT.md`
 * stops refusing a word it enforces.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const workspaceRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const REGISTER = join(workspaceRoot, 'docs', 'writing-style.md');

/**
 * Written by a tool, out of copy that is already published.
 *
 * `CHANGELOG.md` is `changeset version`'s output and `.changeset/README.md`
 * ships with the tool.
 */
const GENERATED = [/(?:^|\/)CHANGELOG\.md$/, /^\.changeset\//];

/**
 * The dashes, and what `docs/writing-style.md` says to write instead.
 *
 * `says` is the sentence the register has to still carry for the rule to be
 * enforced here.
 */
const RULES = [
	{
		name: 'em dash',
		label: 'an em dash',
		pattern: /—/g,
		applies: () => true,
		says: /No em dashes\./,
		advice:
			'End the sentence or use a comma. A dash standing in for a colon, a comma, a full stop and a parenthesis are four different repairs, so choose from what the sentence is doing.',
	},
	{
		name: 'spaced en dash',
		label: 'a spaced en dash',
		pattern: /–/g,
		applies: isSpaced,
		says: /an en dash trades one tell for another/,
		advice:
			'An en dash between spaces is an em dash in a smaller hat. Repair the sentence. An unspaced en dash in a range, 1.04-1.62, is correct and is not read here.',
	},
];

/**
 * Whether a dash has whitespace against it, read off the line as written.
 *
 * The masked line is what says the dash is prose rather than a literal, and it
 * cannot answer this: masking a code span leaves spaces behind, so `` `a`–`z` ``
 * reads as spaced once the two spans are blanked. The range is correct and the
 * connector is not, and only the raw line tells them apart. The ends of a line
 * count as whitespace, because a wrapped paragraph puts them there.
 */
function isSpaced(raw, at) {
	const before = at === 0 ? ' ' : raw[at - 1];
	const after = at + 1 >= raw.length ? ' ' : raw[at + 1];
	return /\s/.test(before) || /\s/.test(after);
}

/** Below this a rule has been dropped from RULES and nothing checks for it. */
const MINIMUM_RULES = 2;

/** Below this the listing has stopped finding the workspace's prose. */
const MINIMUM_FILES = 50;

/** The word that opens a marker, and the token the sweep for a stale one looks for. */
const MARKER_WORD = 'prose-ignore';

/** A well-formed marker: an HTML comment on a line of its own. */
const MARKER = /^\s*<!--\s*prose-ignore:\s*(.*?)\s*-->\s*$/;

function main() {
	if (RULES.length < MINIMUM_RULES) {
		fail(
			`RULES holds ${count(RULES.length, 'rule')} (${names(RULES)}), fewer than the ${MINIMUM_RULES} this expects. A rule has been dropped and every check on it has stopped. Put it back in scripts/check-prose.mjs, or, if docs/writing-style.md has stopped naming it, lower MINIMUM_RULES in the same commit.`,
		);
	}

	assertRegisterStillSaysIt();

	const files = markdownFiles().map(readFile);
	if (files.length < MINIMUM_FILES) {
		fail(
			`read ${count(files.length, 'markdown file')}, fewer than the ${MINIMUM_FILES} this expects. The listing has stopped finding the workspace's prose, so this gate is passing over documents nobody is reading. Fix markdownFiles in scripts/check-prose.mjs, or lower MINIMUM_FILES if that many documents were genuinely deleted.`,
		);
	}

	report(files);
}

/**
 * That `docs/writing-style.md` still bans what this enforces.
 *
 * The document is the register and this file is the reader. A rule enforced
 * here and gone from there is a rule nobody agreed to, and the branch that
 * deletes the sentence should be the branch that deletes the check.
 *
 * Whitespace is collapsed first, because the document is wrapped at 80 and a
 * sentence this looks for spans two lines.
 */
function assertRegisterStillSaysIt() {
	const register = readFileSync(REGISTER, 'utf8').replace(/\s+/g, ' ');
	const missing = RULES.filter((rule) => !rule.says.test(register));
	if (missing.length > 0) {
		fail(
			`docs/writing-style.md no longer says what this gate enforces for ${names(missing)}. Take the rule out of RULES in scripts/check-prose.mjs, or put the sentence back in the document it was written in.`,
		);
	}
}

// ---------------------------------------------------------------------------
// The files
// ---------------------------------------------------------------------------

/** Every tracked markdown file, generated ones excluded, as workspace-relative paths. */
function markdownFiles() {
	const listed = execFileSync('git', ['ls-files', '-z', '--', '*.md'], {
		cwd: workspaceRoot,
		encoding: 'utf8',
		maxBuffer: 32 * 1024 * 1024,
	});

	return listed
		.split('\0')
		.filter((path) => path.length > 0)
		.filter((path) => !GENERATED.some((generated) => generated.test(path)));
}

function readFile(where) {
	const source = readFileSync(join(workspaceRoot, where), 'utf8').replace(/\r\n/g, '\n');
	const lines = source.split('\n');
	const masked = maskLiterals(lines);

	return {
		where,
		lines,
		findings: findingsIn(lines, masked, where),
		markers: markersIn(lines, masked, where),
	};
}

// ---------------------------------------------------------------------------
// The prose
// ---------------------------------------------------------------------------

/**
 * The lines with every literal blanked out, one space per character.
 *
 * Same length in and out, so a column read off the mask is a column in the
 * file. A fence opens on ``` or ~~~ and closes on the same character at the
 * same length or longer, which is CommonMark's rule and is what stops a ```js
 * block from being closed by a ``` inside a nested example.
 */
function maskLiterals(lines) {
	let fence = null;

	return lines.map((line) => {
		if (fence !== null) {
			fence = closesFence(line, fence) ? null : fence;
			return blank(line);
		}

		fence = opensFence(line);
		return fence === null ? maskInlineCode(line) : blank(line);
	});
}

/** The run of backticks or tildes a line opens a fence with, or `null`. */
function opensFence(line) {
	const opened = line.match(/^\s{0,3}(`{3,}|~{3,})/);
	return opened === null ? null : opened[1];
}

/** Whether a line closes the open fence: same character, at least as long, nothing after it. */
function closesFence(line, fence) {
	const closed = line.match(/^\s{0,3}(`{3,}|~{3,})\s*$/);
	return closed !== null && closed[1][0] === fence[0] && closed[1].length >= fence.length;
}

const blank = (text) => ' '.repeat(text.length);

const maskInlineCode = (line) => line.replace(/`+[^`]*`+/g, blank);

/**
 * Every dash this gate reads, found on the masked line and judged on the raw
 * one.
 */
function findingsIn(lines, masked, where) {
	return masked.flatMap((line, at) =>
		RULES.flatMap((rule) =>
			columnsIn(rule, line, lines[at]).map((column) => ({ where, rule, line: at + 1, column })),
		),
	);
}

/**
 * The one-based columns on one line where a rule's dash is written as prose.
 *
 * `matchAll` over the masked line finds the candidates, `applies` reads the raw
 * one. `matchAll` and not `exec`, so a shared pattern's `lastIndex` never
 * carries from one line to the next.
 */
function columnsIn(rule, masked, raw) {
	return [...masked.matchAll(rule.pattern)]
		.filter((hit) => rule.applies(raw, hit.index))
		.map((hit) => hit.index + 1);
}

// ---------------------------------------------------------------------------
// The markers
// ---------------------------------------------------------------------------

/**
 * Every marker in one file, well formed or not, and the line each is above.
 *
 * The sweep is for the word anywhere on a line rather than for the shape,
 * because a marker that does not parse is the case worth catching. Somebody
 * wrote it meaning to excuse something, and collecting only the ones that match
 * would report the line below as unmarked with nothing saying why.
 *
 * It sweeps the masked line, which is what lets a document name the marker.
 * `CLAUDE.md` and `docs/writing-style.md` both write the shape out so a reader
 * knows how to type one, and both write it in backticks, so the mask takes it
 * out of this sweep. A marker meant as a marker is not in backticks.
 */
function markersIn(lines, masked, where) {
	return masked.flatMap((line, at) =>
		line.includes(MARKER_WORD)
			? [{ where, line: at + 1, target: targetOf(masked, at) + 1, ...read(lines[at]) }]
			: [],
	);
}

/** The line a marker is above: the first below it that is not another marker. */
function targetOf(masked, at) {
	let target = at + 1;
	while (target < masked.length && masked[target].includes(MARKER_WORD)) {
		target += 1;
	}
	return target;
}

/** One marker as `{ reason }`, or `{ problem }` saying what is wrong with it. */
function read(line) {
	const marker = line.match(MARKER);
	if (marker === null) {
		return { problem: `it does not read "<!-- ${MARKER_WORD}: <reason> -->" on a line of its own` };
	}

	const reason = marker[1];
	if (reason.split(/\s+/).filter((word) => word.length > 0).length < 3) {
		return { problem: 'it carries no reason, and the reason is the point of a marker' };
	}
	if (!reason.endsWith('.')) {
		return { problem: 'its reason does not end in a full stop' };
	}
	return { reason };
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

function report(files) {
	const problems = files.flatMap(problemsIn);

	if (problems.length === 0) {
		announce(files);
		return;
	}

	console.error(problems.join('\n\n'));
	process.exit(1);
}

/** A dash with no marker over it, and a marker over no dash. */
function problemsIn(file) {
	const { findings, markers, lines } = file;
	const exempts = (marker, finding) =>
		marker.problem === undefined && marker.target === finding.line;

	return [
		...findings
			.filter((finding) => !markers.some((marker) => exempts(marker, finding)))
			.map((finding) => unmarkedMessage(finding, lines)),
		...markers
			.filter((marker) => !findings.some((finding) => exempts(marker, finding)))
			.map(staleMessage),
	];
}

function unmarkedMessage(finding, lines) {
	return [
		`check-prose: ${finding.where}:${finding.line}:${finding.column} writes ${finding.rule.label}.`,
		'',
		`  ${trim(lines[finding.line - 1].trim())}`,
		'',
		`docs/writing-style.md bans it. ${finding.rule.advice}`,
		'If the dash is right here, say why on the line above:',
		'',
		`  <!-- ${MARKER_WORD}: one sentence ending in a full stop. -->`,
	].join('\n');
}

function staleMessage(marker) {
	return marker.problem === undefined
		? `check-prose: ${marker.where}:${marker.line} marks line ${marker.target} and exempts nothing.\n\nNothing on that line is a dash this gate reads. Either the prose was fixed and the marker outlived it, or the marker is not the line above the one it means.`
		: `check-prose: ${marker.where}:${marker.line} is not a marker, because ${marker.problem}.`;
}

function announce(files) {
	const markers = files.reduce((total, file) => total + file.markers.length, 0);
	console.log(
		`check-prose: ${count(files.length, 'markdown file')}, ${names(RULES)} at zero, ${count(markers, 'line')} exempted by a marker.`,
	);
}

const names = (rules) => rules.map((rule) => rule.name).join(' and ');

const trim = (line) => (line.length > 100 ? `${line.slice(0, 100)}...` : line);

const count = (total, noun) => `${total} ${noun}${total === 1 ? '' : 's'}`;

function fail(message) {
	console.error(`check-prose: ${message}`);
	process.exit(1);
}

main();
