#!/usr/bin/env node
/**
 * Holds user-facing copy to the dash rule in `docs/writing-style.md`.
 *
 * Run it with `pnpm check:copy-dashes`.
 *
 * `pnpm check:prose` holds the same rule over markdown and reads no TypeScript.
 * `pnpm check:vocabulary` reads copy and enforces the `CONTEXT.md` register
 * alone. So the dash rule bound on what a user reads through `CLAUDE.md` and
 * nothing checked it, which is how 62 em dashes and 4 spaced en dashes
 * collected in copy while the same rule sat at zero under `docs/` (#584).
 *
 * ## The rule, and the glyph it does not reach
 *
 * `docs/writing-style.md` bans the em dash and a spaced en dash, and it says in
 * the same bullet that this is a rule about punctuation inside a sentence: a
 * standalone glyph picked as a UI symbol is not prose and is not in scope. That
 * carve-out is #584's decision and `AbsentValue` in `packages/ui-web` is what
 * draws it. So a whole string literal that is nothing but the em dash passes,
 * and the same dash in a sentence fails.
 *
 * A whole string literal, not a trimmed one. `` ` — ${code}` `` trims to the
 * em dash and is a separator in the middle of one sentence, which is the shape
 * #607 swept out of five templates. A template's fixed chunks are fragments of
 * one piece of copy rather than pieces of copy in their own right, so the
 * exemption asks whether the delimiters either side of the text are its own.
 * `isWholeLiteral` reads those two characters out of the source; nothing in
 * `copy-strings.mjs` changes to serve this. A backtick counts, because a
 * template with nothing interpolated into it is a whole literal like any other.
 *
 * The en dash is here because the rule names it: swapping one in "trades one
 * tell for another". Only a spaced one. `${low}–${high}` is a range, and its
 * fixed chunk is a bare dash with an interpolated number against each side, so
 * the ends of a chunk count as content rather than as whitespace. Four ranges
 * in `apps/web` are written that way and none of them needs a marker, which is
 * what keeps this gate at zero with no allowance list.
 *
 * ## What it reads
 *
 * `copyStrings` already answers what copy is, separating a string literal that
 * is words from a module specifier, a path, a wiring attribute or an identifier
 * constant, and finding the text between two JSX tags. This reuses it rather
 * than writing a second answer, over the same three roots `check-vocabulary`
 * scans: the apps that ship screens.
 *
 * Code comments are out, and that is a measurement rather than a preference.
 * `check-prose` records it: 3,059 em dashes in `.ts`, `.tsx` and `.mjs` here,
 * 2,265 of them under `apps/`. A gate reading those would fail on every branch
 * and be switched off, which is the same line `check-vocabulary` draws for the
 * 2,100 comments that said agency. Markdown is out too, because `check-prose`
 * has it: that gate's masker, its `git ls-files` listing and its HTML-comment
 * marker are all markdown shaped, and pointing it at TypeScript would mean
 * three rewrites for one rule.
 *
 * ## A third marker word, and why
 *
 * A dash can be right and still be caught, and the exemption is a comment on
 * the line above:
 *
 *     // copy-dash-ignore: quoting the heading changeset writes.
 *
 * The word is this gate's own rather than `prose-ignore` or
 * `vocabulary-ignore`. `check-prose` reads markdown and takes an HTML comment,
 * so its marker cannot be typed here at all. `check-vocabulary`'s marker names
 * a refused word after it and is documented as enforcing the `CONTEXT.md`
 * register; a dash is not on that register, and sharing the word would make one
 * gate's stale-marker failure fire on the other's exemption.
 *
 * The two rules on a marker are the ones both existing gates carry, and both
 * exist for the same reasons. The reason ends in a full stop, because #291's
 * wrapped `biome-ignore` is the trap: a reason that runs onto a second line
 * silently stops suppressing, and a full stop makes the first line fail at the
 * marker. And a marker that exempts nothing fails, because an unused allowance
 * is headroom the next violation lands inside, which is the `fallow` baseline
 * failure `CLAUDE.md` describes. A count of excused strings could say neither
 * which nor why.
 *
 * The marker line is read off the masked source as well as the source, so the
 * word has to be in a comment. Written inside a string literal it exempts
 * nothing, and the string is copy that gets read like any other.
 *
 * A `// copy-dash-ignore` written between two tags is not handled here.
 * `check-vocabulary` refuses every comment in JSX children across these same
 * three roots and is at zero, so the shape cannot reach this gate.
 *
 * ## The floors
 *
 * #591's lesson, three times, because each one is a different silent pass.
 * `MINIMUM_RULES` fails when a dash is dropped from `RULES`. `MINIMUM_FILES`
 * fails when the walk stops finding the apps, which is what a moved root or a
 * wrong skip looks like from here. `MINIMUM_COPY` fails when the walk still
 * finds the files and `copyStrings` stops finding words in them, which is what
 * a regression in the masker looks like. Without them a gate that has stopped
 * reading anything still exits 0 under a summary line that reads like a pass.
 *
 * The rule itself is read back out of `docs/writing-style.md`, the way
 * `check-prose` reads it and `check-vocabulary` reads `CONTEXT.md`. If that
 * document stops banning the dash, or stops carving the standalone glyph out,
 * this fails and says to change the gate rather than enforcing a rule nobody
 * agreed to.
 *
 * ## Where the halves live
 *
 * The dash, the sentence banning it and the message a reader gets are in
 * `lib/dash-rule.mjs`, shared with `check-prose.mjs`. The marker frame is in
 * `lib/style-gate.mjs` with `check-vocabulary`'s. What is left here is the
 * copy: which roots, what the absence glyph is, and what makes a dash inside a
 * template chunk spaced.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { copyStrings } from './lib/copy-strings.mjs';
import { DASHES, EM_DASH, names, unmarkedMessage, unstatedRules } from './lib/dash-rule.mjs';
import { maskedSource } from './lib/masked-source.mjs';
import { pathFrom } from './lib/relative-path.mjs';
import { typeScriptFilesUnder } from './lib/source-files.mjs';
import {
	count,
	failure,
	markersAcross,
	markersIn,
	reasonOf,
	reasonProblem,
	report,
} from './lib/style-gate.mjs';

const GATE = 'check-copy-dashes';
const workspaceRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const REGISTER = join(workspaceRoot, 'docs', 'writing-style.md');
const fail = failure(GATE);

/**
 * The roots holding user-facing copy, the same three `check-vocabulary` reads.
 * The server and the packages ship no screens, and `apps/preview` is an
 * internal component gallery rather than a product surface.
 */
const COPY_ROOTS = ['apps/web/src', 'apps/admin/src', 'apps/mobile/src'];

/**
 * The two dashes, with what to write instead of each and when each applies.
 *
 * The character, the label and the sentence in the register are `dash-rule.mjs`
 * and are shared with `check-prose`. `applies` is this gate's, because it is
 * the whole of what differs between the two corpora, and the advice is too: an
 * app has `AbsentValue` for the one case the ban does not reach.
 */
const RULES = [
	{
		...DASHES.em,
		applies: ({ piece, source }) => !isAbsenceGlyph(piece, source),
		advice:
			'End the sentence or use a comma. A standalone glyph is a different thing and is allowed: draw an absent value with AbsentValue from @simmer-mosquito/ui-web.',
	},
	{
		...DASHES.en,
		applies: ({ piece, at }) => isSpaced(piece.text, at),
		advice:
			'An en dash between spaces is an em dash in a smaller hat. Repair the sentence. An unspaced one in a range, 1.04-1.62, is correct and is not read here.',
	},
];

/** The sentence carving the standalone glyph out of the dash rule. */
const CARVE_OUT = {
	name: 'the standalone glyph',
	says: /A standalone glyph picked as a UI symbol is not prose and is not in scope/,
};

/** Below this a dash has been dropped from RULES and nothing checks for it. */
const MINIMUM_RULES = 2;

/** Below this the walk has stopped finding the apps that ship screens. */
const MINIMUM_FILES = 600;

/** Below this the files are still found and `copyStrings` has stopped reading words out of them. */
const MINIMUM_COPY = 10000;

/** The word that opens a marker, and the token the sweep for a stale one looks for. */
const MARKER_WORD = 'copy-dash-ignore';

function main() {
	if (RULES.length < MINIMUM_RULES) {
		fail(
			`RULES holds ${count(RULES.length, 'rule')} (${names(RULES)}), fewer than the ${MINIMUM_RULES} this expects. A dash has been dropped and every check on it has stopped. Put it back in scripts/check-copy-dashes.mjs, or, if docs/writing-style.md has stopped naming it, lower MINIMUM_RULES in the same commit.`,
		);
	}

	assertRegisterStillSaysIt();

	const files = COPY_ROOTS.flatMap(readRoot);
	assertItReadTheApps(files);
	report(
		files,
		{
			unmarked: unmarkedMessage(GATE, `// ${MARKER_WORD}: one sentence ending in a full stop.`),
			stale: staleMessage,
		},
		() => announce(files),
	);
}

/**
 * That `docs/writing-style.md` still says what this gate enforces, bans and
 * carve-out alike.
 *
 * The carve-out is pinned with the bans, and not only because it is a sentence
 * in the same document. It is the whole of why this gate passes `AbsentValue`'s
 * dash, so a document that stops saying it is a document asking for every glyph
 * to be reported, and that is a decision for the branch editing it rather than
 * a default this file keeps.
 */
function assertRegisterStillSaysIt() {
	const missing = unstatedRules(REGISTER, [...RULES, CARVE_OUT]);
	if (missing.length > 0) {
		fail(
			`docs/writing-style.md no longer says what this gate enforces for ${missing.join(' and ')}. Change scripts/check-copy-dashes.mjs to match the document, or put the sentence back in the document it was written in.`,
		);
	}
}

/** That the walk found the apps and `copyStrings` found words in them. */
function assertItReadTheApps(files) {
	if (files.length < MINIMUM_FILES) {
		fail(
			`read ${count(files.length, 'source file')} under ${COPY_ROOTS.join(', ')}, fewer than the ${MINIMUM_FILES} this expects. The walk has stopped finding the apps that ship screens, so this gate is passing over copy nobody is reading. Fix COPY_ROOTS in scripts/check-copy-dashes.mjs, or lower MINIMUM_FILES if that many files were genuinely deleted.`,
		);
	}

	const copy = copyAcross(files);
	if (copy < MINIMUM_COPY) {
		fail(
			`read ${count(copy, 'piece')} of copy out of ${count(files.length, 'source file')}, fewer than the ${MINIMUM_COPY} this expects. The files are being found and copyStrings has stopped reading words out of them, which is a regression in scripts/lib/masked-source.mjs or scripts/lib/copy-strings.mjs rather than anything about dashes.`,
		);
	}
}

/** How many pieces of copy the walk read, which is the floor and the summary line. */
const copyAcross = (files) => files.reduce((total, file) => total + file.copyCount, 0);

// ---------------------------------------------------------------------------
// The copy
// ---------------------------------------------------------------------------

/** Every finding and every marker under one root. */
const readRoot = (root) =>
	[...typeScriptFilesUnder(join(workspaceRoot, root))].map((file) => readFile(file));

function readFile(file) {
	const source = readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
	const where = pathFrom(workspaceRoot, file);
	const lines = source.split('\n');
	const masked = maskedSource(source).split('\n');
	const pieces = copyStrings(source);

	return {
		where,
		lines,
		copyCount: pieces.length,
		findings: findingsIn(pieces, source, where),
		markers: markersOf(lines, masked, where),
	};
}

/**
 * Every dash this gate reads in one file's copy.
 *
 * The reported line is the line the dash is on rather than the line the copy
 * opened on. A JSX run starts at the `>` that closed the tag above it, and
 * pointing a person at that tag is how a gate gets a reputation for being
 * wrong. It is also what a marker is measured against, so a run spanning four
 * lines takes its marker above the line holding the dash, and it is why the
 * message can quote the source line: that line always holds the dash, and a
 * template's fixed chunk quoted on its own is often one character wide.
 */
function findingsIn(pieces, source, where) {
	return pieces.flatMap((piece) =>
		RULES.flatMap((rule) =>
			[...piece.text.matchAll(rule.pattern)]
				.filter((hit) => rule.applies({ piece, source, at: hit.index }))
				.map((hit) => ({ where, rule, ...positionOf(source, piece.index + hit.index) })),
		),
	);
}

/** One index into the source, as the one-based line and column a reader can jump to. */
function positionOf(source, index) {
	const before = source.slice(0, index);
	const opened = before.lastIndexOf('\n');
	return { line: before.split('\n').length, column: index - opened };
}

/**
 * Whether a piece of copy is the deliberate absence glyph rather than a
 * sentence.
 *
 * Both halves matter. The text has to be the em dash and nothing else, and the
 * text has to be a whole string literal, because a template's fixed chunk is a
 * fragment of a longer sentence and `` ` — ${code}` `` would otherwise read as
 * a lone glyph.
 */
const isAbsenceGlyph = (piece, source) =>
	piece.text.trim() === EM_DASH && isWholeLiteral(piece, source);

/** The delimiters a whole string literal sits behind. */
const QUOTES = new Set(["'", '"', '`']);

/**
 * Whether the text came out of a literal of its own rather than out of the
 * middle of one.
 *
 * `copyStrings` hands back the body and its index, and the two characters
 * either side of that body are the delimiters it sat behind. A whole literal
 * has a matching pair, and that is what tells the three shapes apart: a
 * template chunk between interpolations opens on a `}` or closes on a `$`, and
 * a run of JSX text opens on the `>` that closed the tag above it.
 *
 * The backtick is in, because a template with no interpolation in it is a whole
 * literal. `` `—` `` is the same glyph as `'—'` and Biome leaves it alone.
 */
function isWholeLiteral(piece, source) {
	const opens = source[piece.index - 1];
	return QUOTES.has(opens) && source[piece.index + piece.text.length] === opens;
}

/**
 * Whether a dash has whitespace against it, read inside the piece of copy.
 *
 * The ends count as content rather than as whitespace, which is the opposite of
 * what `check-prose` does with the ends of a line, and for the opposite reason.
 * A wrapped paragraph puts a line end where a space belongs; a template chunk
 * puts one where an interpolated value renders, so `${low}–${high}` is a range
 * and reads unspaced.
 */
function isSpaced(text, at) {
	const before = at === 0 ? '' : text[at - 1];
	const after = at + 1 >= text.length ? '' : text[at + 1];
	return /\s/.test(before) || /\s/.test(after);
}

// ---------------------------------------------------------------------------
// The markers
// ---------------------------------------------------------------------------

/** Every marker in one file, well formed or not, and the line each one is above. */
const markersOf = (lines, masked, where) =>
	markersIn(lines, MARKER_WORD, (at) => read(lines[at], masked[at])).map((marker) => ({
		where,
		...marker,
	}));

/**
 * One marker as `{ reason }`, or `{ problem }` saying what is wrong with it.
 *
 * The masked line is what says the word is in a comment. Masking leaves spaces
 * wherever a comment body or a string body was, so a line still carrying
 * letters there is code: the marker was typed inside a string literal, where it
 * exempts nothing and is itself copy.
 */
function read(line, masked) {
	if (/[A-Za-z0-9]/.test(masked)) {
		return { problem: 'the word is in code or in a string rather than in a comment' };
	}

	const marker = line.match(new RegExp(`${MARKER_WORD}\\s*:\\s*(.*)$`));
	if (marker === null) {
		return { problem: `it does not read "${MARKER_WORD}: <reason>"` };
	}

	const reason = reasonOf(marker[1]);
	const problem = reasonProblem(reason);
	return problem === null ? { reason } : { problem };
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

const staleMessage = (marker) =>
	marker.problem === undefined
		? `${GATE}: ${marker.where}:${marker.line} marks line ${marker.target} and exempts nothing.\n\nNo copy on that line writes a dash this gate reads. Either the copy was fixed and the marker outlived it, or the marker is not the line above the one it means. A reason wrapped onto a second line does the second of those.`
		: `${GATE}: ${marker.where}:${marker.line} is not a marker, because ${marker.problem}.`;

function announce(files) {
	const markers = markersAcross(files);
	const copy = copyAcross(files);
	console.log(
		`${GATE}: ${count(copy, 'piece')} of copy in ${count(files.length, 'file')} under ${COPY_ROOTS.length} app roots, ${names(RULES)} at zero, ${count(markers, 'line')} exempted by a marker.`,
	);
}

main();
