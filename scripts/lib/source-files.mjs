/**
 * Every first-party TypeScript source file, for the static gates that scan for
 * a copy of something.
 *
 * Shared by `check-geometry-policies.mjs` and `check-column-vocabularies.mjs`,
 * which walk the same tree for the same reason and had the same walk written
 * twice. What each one skips beyond the defaults differs, so that is a
 * parameter and the walk is not.
 *
 * `typeScriptFilesUnder` is the same walk pointed at one directory, for
 * `check-mutation-coverage.mjs`, which reads a hooks directory and a suites
 * directory rather than the workspace.
 */

import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** Build output and dependencies, which no gate reads. */
const NEVER_SCANNED = ['node_modules', 'dist', 'coverage', '.fallow'];

/**
 * The walk skips `tests` by default, because a suite spells its lists out as
 * input data and a gate looking for a second copy of a register would report
 * every one of them. `{ tests: true }` puts them back, for a gate whose rule
 * binds on a suite as much as on the source it covers.
 */
const SKIPPED_DIRECTORIES = new Set([...NEVER_SCANNED, 'tests']);
const SKIPPED_WITH_TESTS = new Set(NEVER_SCANNED);

/**
 * @param {string} workspaceRoot
 * @param {readonly string[]} generatedPaths Directory suffixes to skip, as `join`ed path segments.
 * @param {{ tests?: boolean }} [options] Whether to walk the `tests` trees too.
 */
export function* sourceFiles(workspaceRoot, generatedPaths = [], options = {}) {
	for (const root of ['apps', 'packages']) {
		for (const project of readdirSync(join(workspaceRoot, root))) {
			const src = join(workspaceRoot, root, project, 'src');
			if (isDirectory(src)) {
				yield* typeScriptFilesUnder(src, generatedPaths, options);
			}
		}
	}
}

/**
 * Every `.ts` and `.tsx` file under one directory.
 *
 * The skip list applies to directories found inside the walk, not to the one
 * passed in, so a caller can point this at a directory below `tests` and get
 * its files. That is how the mutation-coverage gate reads the dispatch suites.
 *
 * @param {string} directory
 * @param {readonly string[]} generatedPaths Directory suffixes to skip, as `join`ed path segments.
 * @param {{ tests?: boolean }} [options] Whether to walk `tests` directories too.
 */
export function* typeScriptFilesUnder(directory, generatedPaths = [], options = {}) {
	const skipped = options.tests === true ? SKIPPED_WITH_TESTS : SKIPPED_DIRECTORIES;

	for (const entry of readdirSync(directory, { withFileTypes: true })) {
		const path = join(directory, entry.name);

		if (entry.isDirectory()) {
			if (!skipped.has(entry.name) && !isGenerated(path, generatedPaths)) {
				yield* typeScriptFilesUnder(path, generatedPaths, options);
			}
			continue;
		}

		if (/\.tsx?$/.test(entry.name) && !entry.name.endsWith('.gen.ts')) {
			yield path;
		}
	}
}

const isGenerated = (path, generatedPaths) =>
	generatedPaths.some((generated) => path.endsWith(generated));

function isDirectory(path) {
	try {
		return statSync(path).isDirectory();
	} catch {
		return false;
	}
}
