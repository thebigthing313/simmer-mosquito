/**
 * Every first-party TypeScript source file, for the static gates that scan for
 * a copy of something.
 *
 * Shared by `check-geometry-policies.mjs` and `check-column-vocabularies.mjs`,
 * which walk the same tree for the same reason and had the same walk written
 * twice. What each one skips beyond the defaults differs, so that is a
 * parameter and the walk is not.
 */

import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** Only the workspace's own source is scanned. Tests spell lists out as input data. */
const SKIPPED_DIRECTORIES = new Set(['node_modules', 'dist', 'coverage', '.fallow', 'tests']);

/**
 * @param {string} workspaceRoot
 * @param {readonly string[]} generatedPaths Directory suffixes to skip, as `join`ed path segments.
 */
export function* sourceFiles(workspaceRoot, generatedPaths = []) {
	for (const root of ['apps', 'packages']) {
		for (const project of readdirSync(join(workspaceRoot, root))) {
			const src = join(workspaceRoot, root, project, 'src');
			if (isDirectory(src)) {
				yield* walk(src, generatedPaths);
			}
		}
	}
}

function* walk(directory, generatedPaths) {
	for (const entry of readdirSync(directory, { withFileTypes: true })) {
		const path = join(directory, entry.name);

		if (entry.isDirectory()) {
			if (!SKIPPED_DIRECTORIES.has(entry.name) && !isGenerated(path, generatedPaths)) {
				yield* walk(path, generatedPaths);
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
