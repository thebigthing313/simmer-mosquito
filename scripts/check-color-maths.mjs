#!/usr/bin/env node
/**
 * Holds the colour maths to one file.
 *
 * #617 collapsed four implementations of the same arithmetic into
 * `packages/design-tokens/src/color.ts`: the design-token screen in
 * `apps/preview`, the semantic-token contrast guard in `packages/ui-web`, the
 * hex mirror guard beside the register, and the basemap contrast pass in
 * `scripts/map-style/contrast.mjs`. Three of the four carried the sRGB
 * luminance coefficients and three carried the OKLCH matrix, and by the time
 * anyone counted they had drifted on the linearization knee: one wrote the
 * value from an earlier revision of the same specification and the rest wrote
 * the current one.
 *
 * Nothing was wrong on screen, which is the part worth remembering. Every
 * caller fed integer sRGB channels and no integer channel falls between the two
 * knees, so a drifted constant never changed a printed number. Four copies
 * moving apart with nothing holding them together is the finding; a wrong pixel
 * was only what it had not produced yet.
 *
 * The consolidation held on somebody remembering, and this is what it holds on
 * now. One rule: no file outside the register writes one of the register's
 * constants.
 *
 * ## What counts as a constant, and why it is not a list
 *
 * The candidates are read out of `color.ts` rather than copied here, the way
 * `check-write-references.mjs` reads `RECORD_REFERENCE_COLUMNS` out of the
 * module it gates. A list written here would be a second copy of the register,
 * which is the shape this exists to refuse.
 *
 * A candidate is a numeric literal with four or more digits after the point,
 * and in this file that is exactly the three groups #707 names and nothing
 * else: the two linearization knees, the four OKLCH matrix rows, and the three
 * WCAG luminance coefficients. Every other number in the register is short and
 * ordinary, `12.92` and `1.055` and `2.4` and `4.5` among them, and a gate
 * refusing those anywhere in the workspace would be refusing arithmetic rather
 * than a copy. Length is what makes a match mean something: nobody writes a
 * ten-digit decimal down unless they are converting a colour. This docblock
 * does not spell one out for the same reason, and the first draft of it did,
 * which is how the gate's first run reported the gate.
 *
 * ## The corpus
 *
 * TypeScript under `apps/` and `packages/` with the tests trees in, and `.mjs`
 * under `scripts/`. Both halves are where a copy actually lived: one of the
 * four was a suite in `packages/ui-web` and one was a build script. The tests
 * trees are in for the reason `check-join-types.mjs` reads them, which is that
 * a suite is where the drift grew last time.
 *
 * At zero with no allowance list. A file wanting an exemption is a file wanting
 * its own colour maths, which is the thing that drifted.
 *
 * Run it with `pnpm check:color-maths`.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pathFrom } from './lib/relative-path.mjs';
import { sourceFiles } from './lib/source-files.mjs';
import { count, failure } from './lib/style-gate.mjs';

const GATE = 'check-color-maths';
const workspaceRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const fail = failure(GATE);

/** The one file the colour maths lives in. */
const REGISTER = 'packages/design-tokens/src/color.ts';

/** Where the build scripts are, one of which was the fourth copy. */
const SCRIPTS = join(workspaceRoot, 'scripts');

/**
 * A numeric literal with four or more digits after the point.
 *
 * The word boundary at the front keeps a version number out: `1.0.4045` is
 * three numbers and none of them is a knee.
 */
const LONG_DECIMAL = /(?<![\d.])\d+\.\d{4,}(?![\d.])/g;

/**
 * The floors under the scan, both of them #591's rule: a run that has stopped
 * reading something must fail rather than report a clean zero.
 *
 * `MINIMUM_CONSTANTS` is the one that matters here. The candidate set is read
 * out of the register, so a register that has been renamed, reformatted or
 * emptied yields nothing to look for and every copy in the workspace passes,
 * under the same summary line a green run prints. Thirty-eight is what
 * `color.ts` holds: two knees, thirty-three matrix entries, three luminance
 * coefficients.
 *
 * `MINIMUM_FILES` is the other half, against a walk that has stopped finding
 * the workspace.
 */
const MINIMUM_CONSTANTS = 38;
const MINIMUM_FILES = 1600;

function main() {
	const constants = registerConstants();
	if (constants.size < MINIMUM_CONSTANTS) {
		fail(
			`read ${count(constants.size, 'constant')} out of ${REGISTER}, fewer than the ${MINIMUM_CONSTANTS} this expects. The candidates are read out of the register, so a run that finds none passes every copy in the workspace. Check that the file is where LONG_DECIMAL can see its numbers, or lower MINIMUM_CONSTANTS if the maths genuinely got shorter.`,
		);
	}

	const files = [...scannedFiles()];
	if (files.length < MINIMUM_FILES) {
		fail(
			`read ${count(files.length, 'file')}, fewer than the ${MINIMUM_FILES} this expects. The walk has stopped finding the workspace, so a second copy of the colour maths now passes this. Fix the corpus in scripts/check-color-maths.mjs, or lower MINIMUM_FILES if that many files were genuinely deleted.`,
		);
	}

	const findings = scan(files, constants);
	if (findings.length > 0) {
		report(findings);
		return;
	}

	console.log(
		`Colour maths: ${constants.size} constants in ${REGISTER}, ${files.length} files read, no second copy.`,
	);
}

/** Every long decimal the register writes. */
function registerConstants() {
	const source = readFileSync(join(workspaceRoot, REGISTER), 'utf8');
	return new Set(source.match(LONG_DECIMAL) ?? []);
}

/**
 * The corpus, register excluded.
 *
 * The exclusion is by path rather than by skipping the package, because
 * `packages/design-tokens` holds the hex mirror guard and the token screen's
 * neighbours, and one of the four copies was a suite in a package that also
 * held a legitimate caller.
 */
function* scannedFiles() {
	const register = join(workspaceRoot, REGISTER);
	for (const file of sourceFiles(workspaceRoot, [], { tests: true })) {
		if (file !== register) yield file;
	}
	yield* scriptsUnder(SCRIPTS);
}

/** Every file under a directory, `node_modules` aside. */
function* filesUnder(directory) {
	for (const entry of readdirSync(directory, { withFileTypes: true })) {
		if (entry.name === 'node_modules') continue;
		const path = join(directory, entry.name);
		if (entry.isDirectory()) yield* filesUnder(path);
		else yield path;
	}
}

/** Every `.mjs` under the scripts tree. */
function* scriptsUnder(directory) {
	for (const path of filesUnder(directory)) {
		if (path.endsWith('.mjs')) yield path;
	}
}

/** Every register constant written outside it. */
function scan(files, constants) {
	const findings = [];

	for (const file of files) {
		const source = readFileSync(file, 'utf8');
		for (const match of source.matchAll(LONG_DECIMAL)) {
			if (constants.has(match[0])) {
				findings.push(`${where(file)}:${lineOf(source, match.index)} writes ${match[0]}.`);
			}
		}
	}

	return findings;
}

function report(findings) {
	console.error(`${GATE}: ${count(findings.length, 'colour constant')} outside ${REGISTER}.\n`);
	for (const finding of findings) {
		console.error(`  - ${finding}`);
	}
	console.error(
		`\nThe luminance coefficients, the OKLCH matrix rows and both linearization knees ` +
			`live in ${REGISTER}.\nImport what you need from ` +
			`@simmer-mosquito/design-tokens/color rather than writing the arithmetic again, ` +
			`and export a new function from there when nothing exported answers the question.`,
	);
	process.exitCode = 1;
}

function where(path) {
	return pathFrom(workspaceRoot, path);
}

function lineOf(source, index) {
	return source.slice(0, index).split('\n').length;
}

main();
