/**
 * A stand-in for the dev runner, for `dev-server-orphan.integration.test.ts`.
 *
 * It does the one thing the runner does that #331 is about: fork the server
 * entry over an IPC channel, and then stay up. The test force-kills it and
 * asserts the forked server goes with it.
 *
 * The real runner is the wrong parent for that test. It builds five workspace
 * packages before it forks anything and the server it forks needs a reachable
 * database, neither of which is true in CI, and neither is part of what #331
 * changed: the fix is in the server entry, and the runner is untouched.
 *
 * Spawned rather than imported, so `.fallowrc.jsonc` names it as an entry.
 * Reads the entry path and the keep-alive window from the environment so the
 * test owns both.
 */
import { fork } from 'node:child_process';
import process from 'node:process';

const serverEntry = process.env.SIMMER_FIXTURE_SERVER_ENTRY;
if (serverEntry === undefined || serverEntry === '') {
	throw new Error('SIMMER_FIXTURE_SERVER_ENTRY is required.');
}

const child = fork(serverEntry, [], {
	stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
});

// The test reads this to know what to watch. One line, first thing.
console.log(child.pid);

// The IPC channel already holds the loop open, but only while the child lives.
// This makes the fixture's lifetime the test's decision rather than the child's,
// so a child that dies early cannot end the parent and disguise itself as the
// behaviour under test. It is a ceiling, not a wait: the test kills the fixture
// long before this fires.
const keepAlive = setTimeout(
	() => {
		child.kill();
		process.exit(1);
	},
	Number.parseInt(process.env.SIMMER_FIXTURE_MAX_MS ?? '120000', 10),
);
keepAlive.unref();

// Without this the fixture exits as soon as `keepAlive` is unref'd and the
// child's channel is the only handle left, which is the child's lifetime again.
setInterval(() => {}, 1000);
