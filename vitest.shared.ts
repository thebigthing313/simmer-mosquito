import { availableParallelism } from 'node:os';
import { defineConfig } from 'vitest/config';
import type { Reporter, TestModule, Vitest } from 'vitest/node';

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

/**
 * How long one test file may hold a worker without reporting anything.
 *
 * **This is a tripwire against a hang, not a performance gate. Do not tighten
 * it because a suite got slow.** #545 took a 60s budget off
 * `import-side-effects.test.ts` for exactly that reason: the budget was
 * measuring machine load rather than the thing under test, and a bound a slow
 * suite on a loaded two-vCPU runner can trip is worse than no bound, because
 * the next person deletes it.
 *
 * Eight minutes is against two measurements. The slowest file in the workspace
 * is `mission-notification-generation.integration.test.ts` at 101s, which
 * spends nearly all of it waiting on Postgres, and the slowest file in a run
 * with no `TEST_DATABASE_URL` is `record-cleanup.test.tsx` at 7.2s. So this is
 * roughly five times the slowest thing that exists, which is the headroom a
 * two-vCPU runner needs. It still fires twelve minutes inside the 20-minute
 * `Database integration tests` job, which is the job that runs the 101s file.
 * If a suite ever comes near this, the suite is the thing to fix.
 *
 * The number is here rather than in `testTimeout`, and that is the whole point
 * of this block. Vitest 4.1 offers three timeouts and none of them bounds an
 * import: `testTimeout` bounds a test callback, `hookTimeout` a hook, and
 * `teardownTimeout` the wait for shutdown. A module that awaits a promise which
 * never settles hangs at module scope, before any callback or hook exists to
 * time out, so the run sits there until CI kills the job and the report names
 * no file (#663).
 */
const FILE_PROGRESS_BUDGET_MS = 8 * 60 * 1000;

/** How often the watchdog looks at what is still outstanding. */
const FILE_PROGRESS_POLL_MS = 10 * 1000;

/**
 * The bound above, applied from the main process rather than from inside the
 * worker that is stuck.
 *
 * `onTestModuleQueued` fires when a worker picks a file up, not when the file
 * joins the queue, which was measured: with one worker and three files the
 * events arrive as queued, collected, start, end per file, one file at a time.
 * So a file waiting for a free worker is not on the clock, and the window this
 * measures is exactly "a worker is on this file". `onTestModuleQueued` also
 * fires before the module is imported, which is what lets this see the case
 * nothing else can: a module-scope hang produces `queued` and then silence
 * forever.
 *
 * It exits the process rather than cancelling the run, because a fork stuck on
 * an unsettled promise does not answer a cancellation. The exit code fails the
 * branch and the message names the file, which is what the old 60s budget used
 * to do by accident.
 *
 * Watch mode is left alone. A hang there is somebody's editor session, and
 * killing the watcher out from under them is worse than the hang.
 */
class FileProgressWatchdog implements Reporter {
	private armed = false;
	private poll: NodeJS.Timeout | undefined;
	private readonly outstanding = new Map<string, number>();

	onInit(vitest: Vitest) {
		this.armed = !vitest.config.watch;
	}

	onTestRunStart() {
		if (!this.armed || this.poll) return;
		this.poll = setInterval(() => this.check(), FILE_PROGRESS_POLL_MS);
		this.poll.unref();
	}

	onTestModuleQueued(testModule: TestModule) {
		this.outstanding.set(testModule.moduleId, Date.now());
	}

	onTestModuleEnd(testModule: TestModule) {
		this.outstanding.delete(testModule.moduleId);
	}

	onTestRunEnd() {
		if (this.poll) clearInterval(this.poll);
		this.poll = undefined;
		this.outstanding.clear();
	}

	private check() {
		const deadline = Date.now() - FILE_PROGRESS_BUDGET_MS;
		for (const [moduleId, startedAt] of this.outstanding) {
			if (startedAt > deadline) continue;
			const seconds = Math.round((Date.now() - startedAt) / 1000);
			process.stderr.write(
				`\nvitest watchdog: no result from this file after ${seconds}s\n` +
					`  ${moduleId}\n` +
					'A worker took the file and reported nothing. A module-scope await that never\n' +
					'settles does this, and no vitest timeout covers an import: see the budget in\n' +
					'vitest.shared.ts and #663. Killing the run so the file is named.\n\n',
			);
			process.exit(1);
		}
	}
}

export default defineConfig({
	test: {
		exclude: sharedTestExclude,
		fileParallelism: true,
		maxWorkers: TEST_FILE_WORKERS,
		reporters: ['default', new FileProgressWatchdog()],
	},
});
