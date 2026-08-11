import { availableParallelism } from 'node:os';
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
const sharedTestExclude = ['**/node_modules/**', '**/dist/**', '**/.nx/**', '**/build/**'];

/**
 * How many test files may run at once.
 *
 * Vitest's default is `availableParallelism() - 1`, which is one fork on the
 * two-vCPU runner CI gets — that is why the database integration files were
 * measured running strictly one after another, 220.4s of file time against a
 * 221.4s wall clock. Those files spend nearly all of that waiting on Postgres,
 * not on a core, so the core count is the wrong thing to size them by.
 *
 * So this raises the floor to four rather than replacing the default outright:
 * four is chosen against the six integration files in `packages/db` — enough
 * that the slowest of them overlap, low enough that four concurrent migration
 * sets do not swamp a service container sharing those two vCPUs — and a
 * developer's larger machine keeps the wider default it already had. Per-test
 * schema names are already unique, so nothing here changes what a test can see.
 */
const TEST_FILE_WORKERS = Math.max(4, availableParallelism() - 1);

export default defineConfig({
	test: {
		exclude: sharedTestExclude,
		fileParallelism: true,
		maxWorkers: TEST_FILE_WORKERS,
	},
});
