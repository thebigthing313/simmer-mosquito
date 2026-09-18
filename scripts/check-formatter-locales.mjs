#!/usr/bin/env node
/**
 * Requires every display formatter in the two apps and the shared component
 * package to pin its locale tag.
 *
 * `Intl.DateTimeFormat`, `Intl.NumberFormat`, `toLocaleString`,
 * `toLocaleDateString` and `toLocaleTimeString` all format for whatever locale
 * the runtime has when no tag is passed, so an unpinned call draws one thing on
 * a developer's machine and another on a CI runner or a browser set to
 * `de-DE`, and a suite asserting the wording is one locale away from failing
 * (#683). Nothing in the product offers a locale switch, so an unpinned
 * formatter was never serving a preference. The convention is one paragraph in
 * CLAUDE.md, and both passes over it, #683 and #1116, were sweeps by hand:
 * #1116 found the shell header's date line, the error report's `Time` row and
 * the admin organization page's dates each inheriting the browser's locale
 * behind the paragraph. This reads the rule off the tree on the branch that
 * breaks it (#1128).
 *
 * Run it with `pnpm check:formatter-locales`.
 *
 * ## The corpus, and what is out of it
 *
 * `apps/web/src`, `apps/admin/src` and `packages/ui-web/src`, which is the
 * scope the paragraph names: every hand-written module that draws for the two
 * apps. `apps/mobile`, `apps/preview` and `apps/server` are out because the
 * convention does not name them, and widening it is a sweep rather than a
 * flag.
 *
 * `packages/ui-web/src/components/ui` is out because those modules are
 * regenerated from the shadcn registry and a hand edit there is one the next
 * regeneration reverts. Four calls there format unpinned today and this cannot
 * reach them, which is the paragraph's own line and not a gap in the gate.
 *
 * The tests trees are out, which is `check:vocabulary`'s answer rather than
 * `check:map-palette`'s: a suite asserts a formatter's wording under a tag it
 * chose, and `changelog-page.test.tsx` builds a bare `Intl.DateTimeFormat()` to
 * prove its locale stub is live, which a gate reading the suites would refuse.
 *
 * ## What counts as a formatter call, and what a pinned tag is
 *
 * `scripts/lib/formatter-locales.mjs` has the rule and the suite beside it has
 * the table. In one sentence: each of the five calls, found on the masked copy
 * so a call named in a comment is prose, passes a first argument that is a
 * string literal whose body is not empty and is not `default`. Absent,
 * `undefined`, `'default'` and the empty string are each refused with their own
 * sentence, and so is anything that is not a string literal, an identifier or a
 * member among them: a tag that arrives through a variable is one this cannot
 * read, and none exists today. A helper that takes a tag is the case to argue
 * for on the branch that writes one.
 *
 * `toLocaleLowerCase` and `toLocaleUpperCase` are not formatters and are not
 * read. Which `timeZone` a formatter passes is a different rule (#154) and is
 * not read either.
 *
 * There is no marker vocabulary and no allowance list. A formatter with a
 * reason for a tag other than `en-US` passes, because it passes a tag, and the
 * reason lives in its comment the way the paragraph already requires:
 * `todayInTimeZone` pins `en-CA` for year-month-day and `localTimeOfDay` pins
 * `en-GB` for a bare `HH:MM`. A formatter wanting no tag is a formatter wanting
 * the runtime's, and there is no reason for that this gate would honour.
 *
 * ## The floor and the probes
 *
 * `MINIMUM_FILES` is #591's floor under the walk, against a scan that has
 * stopped finding the three roots and prints the summary line a clean run
 * does.
 *
 * `PROBES` is the guard the count cannot be. This gate is at zero, so a
 * pattern matching nothing and a classifier answering "pinned" to everything
 * both print the same clean line over the same 66 calls, and no number read
 * off the tree can tell either from a tree where every call is right. So the
 * reader is handed eleven inline sources with known answers before the walk
 * starts: one per call form passing a tag, which must be one clean call, one
 * per refused shape, which must each be one finding, and
 * `toLocaleLowerCase()`, which must be no call at all. A broken pattern fails
 * on a probe rather than passing the tree.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatterCalls } from './lib/formatter-locales.mjs';
import { pathFrom } from './lib/relative-path.mjs';
import { typeScriptFilesUnder } from './lib/source-files.mjs';
import { lineOf } from './lib/source-position.mjs';
import { count, failure, trim } from './lib/style-gate.mjs';

const GATE = 'check-formatter-locales';
const workspaceRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const fail = failure(GATE);

/** The three roots the convention names, as the paragraph in CLAUDE.md spells them. */
const ROOTS = ['apps/web/src', 'apps/admin/src', 'packages/ui-web/src'];

/** The one directory under them the convention excludes, being regenerated. */
const GENERATED = [join('components', 'ui')];

/**
 * The floor, #591's.
 *
 * 700 modules against a walk that has stopped finding the roots, under the 863
 * `.ts` and `.tsx` modules outside the tests trees and `components/ui` today.
 * Not a ratchet: the gate is at zero, so the number moves only when a module is
 * added or deleted, and raising it buys nothing.
 */
const MINIMUM_FILES = 700;

/**
 * Sources whose answers are known, each as the calls it holds and the findings
 * among them, so a probe answering wrong is named.
 *
 * Five hold one clean call each, one per call form, and the count of calls is
 * asserted as well as the count of findings: a pattern that has stopped
 * matching one form reads its probe as no call and no finding, which is a
 * clean answer only if nothing asks how many calls it saw. Five hold one
 * finding each, one per refused shape. The last holds no call at all, because a
 * pattern one notch wider reads `toLocaleLowerCase` as a formatter and refuses
 * a string helper.
 */
const PROBES = [
	{
		name: 'probe-date-time-format.ts',
		source: "new Intl.DateTimeFormat('en-US');",
		calls: 1,
		findings: 0,
	},
	{
		name: 'probe-number-format.ts',
		source: "new Intl.NumberFormat('en-US');",
		calls: 1,
		findings: 0,
	},
	{
		name: 'probe-to-locale-string.ts',
		source: "value.toLocaleString('en-US');",
		calls: 1,
		findings: 0,
	},
	{
		name: 'probe-to-locale-date.ts',
		source: "date.toLocaleDateString('en-US');",
		calls: 1,
		findings: 0,
	},
	{
		name: 'probe-to-locale-time.ts',
		source: "date.toLocaleTimeString('en-US');",
		calls: 1,
		findings: 0,
	},
	{ name: 'probe-no-argument.ts', source: 'date.toLocaleDateString();', calls: 1, findings: 1 },
	{
		name: 'probe-undefined.ts',
		source: 'new Intl.NumberFormat(undefined, {});',
		calls: 1,
		findings: 1,
	},
	{
		name: 'probe-default.ts',
		source: "date.toLocaleString('default', { month: 'short' });",
		calls: 1,
		findings: 1,
	},
	{ name: 'probe-identifier.ts', source: 'date.toLocaleString(locale);', calls: 1, findings: 1 },
	{ name: 'probe-empty.ts', source: "date.toLocaleString('');", calls: 1, findings: 1 },
	{ name: 'probe-lower-case.ts', source: 'name.toLocaleLowerCase();', calls: 0, findings: 0 },
];

/** Refuse a run whose reader answers any probe wrong, before the walk starts. */
function verifyProbes() {
	for (const probe of PROBES) {
		const calls = formatterCalls(probe.source);
		const findings = calls.filter((call) => call.problem !== null).length;
		if (calls.length !== probe.calls || findings !== probe.findings) {
			fail(
				`the reader finds ${count(calls.length, 'formatter call')} and ${count(findings, 'finding')} in ${probe.name}, and it holds ${probe.calls} and ${probe.findings}. The reader in scripts/lib/formatter-locales.mjs is broken, so a clean run over the tree would mean nothing.`,
			);
		}
	}
}

/** Every module under the three roots, held to the floor under the walk. */
function readCorpus() {
	const files = ROOTS.flatMap((root) => [
		...typeScriptFilesUnder(join(workspaceRoot, root), GENERATED),
	]);

	if (files.length < MINIMUM_FILES) {
		fail(
			`found ${count(files.length, 'module')} under ${ROOTS.join(', ')}, fewer than the ${MINIMUM_FILES} this expects. The walk has stopped finding the roots, so an unpinned formatter now passes this. Fix ROOTS in scripts/check-formatter-locales.mjs, or lower MINIMUM_FILES if that many modules were genuinely deleted.`,
		);
	}

	return files;
}

/** Every formatter call in one file, located as `path:line` with the line it is on. */
function callsIn(file) {
	const source = readFileSync(file, 'utf8').replaceAll('\r\n', '\n');
	const where = pathFrom(workspaceRoot, file);
	const lines = source.split('\n');

	return formatterCalls(source).map((call) => {
		const line = lineOf(source, call.index);
		return { ...call, at: `${where}:${line}`, text: trim(lines[line - 1].trim()) };
	});
}

function report(findings) {
	console.error(`${GATE}: ${count(findings.length, 'display formatter')} with no pinned locale.\n`);
	for (const finding of findings) {
		console.error(
			`  ${finding.at}\n    ${finding.text}\n    ${finding.form} ${finding.problem}.\n`,
		);
	}
	console.error(
		"Every display formatter in these roots passes a locale tag as a string literal, 'en-US' unless\na comment beside it says why another, so the output is the same on every machine and a suite\nmay assert the wording. Pass the tag. A helper that takes the tag as a parameter is the case\nto argue for on this branch, since the gate cannot read one.",
	);
	process.exitCode = 1;
}

function main() {
	verifyProbes();

	const files = readCorpus();
	const calls = files.flatMap(callsIn);
	const findings = calls.filter((call) => call.problem !== null);

	if (findings.length > 0) {
		report(findings);
		return;
	}

	console.log(
		`Formatter locales: ${count(calls.length, 'display formatter')} across ${files.length} modules under ${ROOTS.join(', ')}, each pinning a locale tag.`,
	);
}

main();
