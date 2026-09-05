#!/usr/bin/env node
/**
 * Asserts that every mutation hook `apps/web` exports is named by a dispatch
 * suite.
 *
 * A mutation hook is what turns a form submit into a named domain command. They
 * live in `apps/web/src/hooks/mutations` and are asserted in
 * `apps/web/src/tests/unit/hooks/mutations`, where each suite stubs the
 * collections its hooks import and reads back what was dispatched. All 47 of
 * them are named by a suite today, and until this gate nothing held that line: a
 * new hook could land with no suite referring to it and every other check stayed
 * green. That is the shape #165 found in the acknowledgement flags, where a
 * thing declared beside the command that needs it meant nothing counted the set.
 *
 * Run it with `pnpm check:mutation-coverage`.
 *
 * ## What it checks, and what it does not
 *
 * The rule is that the hook's name appears somewhere in the suites directory. It
 * is not that the hook is called there, and the difference is measured rather
 * than argued. The four control-method catalogs in `catalog.test.ts` are
 * asserted from a table that passes each hook by reference:
 *
 *     { label: 'source reduction', use: useSourceReductionMethodMutations, ... }
 *     const { result } = renderHook(() => catalog.use());
 *
 * A check for `useSourceReductionMethodMutations(` reports three of those four
 * as uncovered while all four are asserted. So the check is textual.
 *
 * The accepted cost is that a hook named only in a docblock satisfies it. That
 * is the weak end on purpose. The failure being guarded is a hook landing with
 * nothing in the suites referring to it at all, and a mention in a comment is
 * still somebody having looked at it.
 *
 * It says nothing about which intents a hook dispatches. Intents are computed at
 * runtime from a comparison against the row as it stands, so "which intents can
 * this hook send" is not answerable from source text. Holding a hook to its
 * intents would need all 314 `renderHook(` call sites to name their hook to
 * `dispatch-harness.ts`, and that is a different job.
 *
 * ## Reading the hooks
 *
 * Every `.ts` and `.tsx` file in the hooks directory is read, not only the ones
 * named `use-*`. Five modules there are named for what they do rather than for a
 * hook (`catalog-writes`, `organization-writes`, `performed-action-writes`,
 * `rest-writes`, `shared`), and a hook exported from one of those counts the
 * same as any other.
 */

import { readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { typeScriptFilesUnder } from './lib/source-files.mjs';

const workspaceRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const HOOKS_DIR = join(workspaceRoot, 'apps/web/src/hooks/mutations');
const SUITES_DIR = join(workspaceRoot, 'apps/web/src/tests/unit/hooks/mutations');

/**
 * An exported hook declaration. Both forms are matched because both are valid
 * and neither is enforced anywhere: every hook is a `function` declaration
 * today, and a `const` arrow would otherwise go uncounted.
 */
const EXPORTED_HOOK = /^export (?:async )?(?:function|const) (use[A-Za-z0-9_]*)\b/gm;

/**
 * How few hooks means the parse has stopped working rather than the directory
 * having shrunk. There were 47 on 2026-09-04, and a refactor that moves the
 * declarations must fail here rather than pass over nothing.
 */
const MINIMUM_HOOKS = 20;

function main() {
	const hooks = readHooks();
	if (hooks.length < MINIMUM_HOOKS) {
		fail(
			`read only ${hooks.length} exported hooks from ${short(HOOKS_DIR)}, which is fewer than the ${MINIMUM_HOOKS} this expects. The declarations have moved and the regex no longer matches them.`,
		);
	}

	const suites = readSuites();
	if (suites.length === 0) {
		fail(`found no suites under ${short(SUITES_DIR)}.`);
	}

	const uncovered = hooks.filter((hook) => !suites.some((suite) => names(suite.text, hook.name)));
	report(uncovered, hooks.length, suites.length);
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

/** Every exported `use*` function in the hooks directory, with the module it comes from. */
function readHooks() {
	return [...typeScriptFilesUnder(HOOKS_DIR)].flatMap((file) => {
		const text = readFileSync(file, 'utf8');
		return [...text.matchAll(EXPORTED_HOOK)].map(([, name]) => ({ name, module: short(file) }));
	});
}

/** Every suite file, `.tsx` as well as `.ts`, and the harness they share. */
function readSuites() {
	return [...typeScriptFilesUnder(SUITES_DIR)].map((file) => ({
		path: short(file),
		text: readFileSync(file, 'utf8'),
	}));
}

/**
 * Whether the text names the hook. Bounded on both sides, so
 * `useCollectionMutations` is not covered by `useCollectionSpeciesMutations`.
 */
function names(text, hook) {
	return new RegExp(`\\b${hook}\\b`).test(text);
}

const short = (path) => relative(workspaceRoot, path).replaceAll('\\', '/');

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

function fail(message) {
	console.error(`check-mutation-coverage: ${message}`);
	process.exit(1);
}

function report(uncovered, hookCount, suiteCount) {
	if (uncovered.length > 0) {
		console.error(
			`check-mutation-coverage: ${uncovered.length} of ${hookCount} mutation hooks are named by no dispatch suite.\n`,
		);
		for (const hook of uncovered) {
			console.error(`  ${hook.name}, exported from ${hook.module}`);
		}
		console.error(
			`\nAssert each one in a suite under ${short(SUITES_DIR)}. The suites there are grouped by write surface, not by module, because each file stubs every collection its hooks import and vi.mock hoists per file. Add to the suite that already covers the surface rather than opening a file per hook.`,
		);
		process.exit(1);
	}
	console.log(
		`check-mutation-coverage: ${hookCount} mutation hooks, all named by one of ${suiteCount} suites.`,
	);
}

main();
