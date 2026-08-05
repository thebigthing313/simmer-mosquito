import { defineConfig } from 'vitest/config';

/**
 * The one thing every package's vitest run needs to agree on: `dist` is build
 * output, not a place to look for tests.
 *
 * Each package compiles `src/**\/*.ts` — tests included, deliberately, because a
 * test that is not typechecked is where a wrong enum member or a bad fixture
 * hides. That puts a second copy of every suite in `dist`, and vitest collected
 * both: `packages/db` was running sixteen files for eight suites, which meant
 * the integration set opened the remote database twice per run for no added
 * signal.
 *
 * Excluding it here rather than excluding tests from the build keeps both
 * properties — tests are typechecked, and they run once.
 */
export const sharedTestExclude = ['**/node_modules/**', '**/dist/**', '**/.nx/**', '**/build/**'];

export default defineConfig({
	test: {
		exclude: sharedTestExclude,
	},
});
