/**
 * The forked server must not outlive the process that forked it (#331).
 *
 * Windows does not kill a forked child when its parent is force-terminated, so
 * a `taskkill /F` on the dev runner used to leave the server alive and holding
 * the port. `ensurePortIsFree` in the runner cleared it on the *next* start,
 * which is cleanup rather than a fix, and #309 saw it by hand.
 *
 * The fix is in the server entry rather than the runner: it exits when its IPC
 * channel closes, which is the one event that fires however the parent ended,
 * because the OS closes the pipe with it.
 *
 * ## Why this spawns real processes
 *
 * `dev-supervisor.test.ts` drives the runner's rules through fakes, and a fake
 * cannot exercise this: the whole mechanism is an OS pipe closing when a
 * process dies. So this is the one server test that needs real ones.
 *
 * ## Why the parent here is not the dev runner
 *
 * The runner builds five workspace packages before it forks anything, and the
 * server it forks needs a reachable database. Neither is true in CI, and
 * neither is part of what changed: the runner is untouched by #331. So the
 * parent is the smallest thing that reproduces the shape the fix cares about,
 * a process that forks the server entry over an IPC channel and then dies
 * without warning it.
 */
import { spawn } from 'node:child_process';
import { connect, createServer } from 'node:net';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const HERE = dirname(fileURLToPath(import.meta.url));
const SERVER_ENTRY = resolve(HERE, '../../main.ts');
const FIXTURE = resolve(HERE, '../support/fork-server-fixture.ts');

/** Long enough for `tsc`-free tsx boot on a cold CI runner, short enough to fail a hang. */
const BOOT_TIMEOUT_MS = 60_000;

/** The child closes an HTTP server and a lazy pool, so this is generous by an order. */
const EXIT_TIMEOUT_MS = 20_000;

/**
 * Enough environment for the entry to reach `listen`. None of it is reached: no
 * request is made, and the Postgres pool connects lazily, so the URL is never
 * dialled.
 */
function serverEnvironment(port: number): NodeJS.ProcessEnv {
	return {
		...process.env,
		SIMMER_FIXTURE_SERVER_ENTRY: SERVER_ENTRY,
		NODE_ENV: 'test',
		HOST: '127.0.0.1',
		PORT: String(port),
		APP_ORIGIN: 'http://localhost:5173',
		DATABASE_URL: 'postgres://unused:unused@127.0.0.1:1/unused',
		WORKOS_API_KEY: 'sk_test_unused',
		WORKOS_CLIENT_ID: 'client_unused',
		WORKOS_COOKIE_PASSWORD: 'unused-cookie-password-of-at-least-32-chars',
		WORKOS_REDIRECT_URI: 'http://localhost:3000/auth/callback',
		// The bypass reads a pair of ids and refuses a half-set one. Neither is
		// set here, so it stays off.
		DEV_IMPERSONATE_WORKOS_USER_ID: '',
		DEV_IMPERSONATE_WORKOS_ORG_ID: '',
	};
}

/** A port the operating system just told us was free. */
function freePort(): Promise<number> {
	return new Promise((resolvePort, reject) => {
		const probe = createServer();
		probe.on('error', reject);
		probe.listen(0, '127.0.0.1', () => {
			const address = probe.address();
			const port = typeof address === 'object' && address !== null ? address.port : 0;
			probe.close(() => {
				resolvePort(port);
			});
		});
	});
}

function isListening(port: number): Promise<boolean> {
	return new Promise((resolveListening) => {
		const socket = connect({ port, host: '127.0.0.1' });
		const settle = (listening: boolean) => {
			socket.destroy();
			resolveListening(listening);
		};
		socket.on('connect', () => settle(true));
		socket.on('error', () => settle(false));
	});
}

function isRunning(pid: number): boolean {
	try {
		// Signal 0 delivers nothing and reports whether the process is there.
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

function delay(ms: number): Promise<void> {
	return new Promise((resolveDelay) => {
		setTimeout(resolveDelay, ms);
	});
}

/** Polls `condition` until it holds, or gives up with `what` in the message. */
async function waitFor(
	what: string,
	timeoutMs: number,
	condition: () => boolean | Promise<boolean>,
): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		if (await condition()) {
			return;
		}
		await delay(200);
	}

	throw new Error(`Timed out after ${timeoutMs}ms waiting for ${what}.`);
}

/**
 * The ungracious kill, on either platform. Node maps `SIGKILL` to
 * `TerminateProcess` on Windows and aims it at this pid alone, which is the
 * case #331 is about: the runner ends without running a handler, and nothing
 * tells the child.
 */
function forceKill(pid: number): void {
	try {
		process.kill(pid, 'SIGKILL');
	} catch {
		// Already gone, which is the state the caller wanted anyway.
	}
}

describe('a force-killed parent', () => {
	it('takes the forked server with it, leaving the port free', async () => {
		const port = await freePort();
		const parent = spawn(process.execPath, ['--import', 'tsx', FIXTURE], {
			cwd: resolve(HERE, '../../..'),
			env: serverEnvironment(port),
			stdio: ['ignore', 'pipe', 'pipe'],
			windowsHide: true,
		});

		let stdout = '';
		let stderr = '';
		parent.stdout.on('data', (chunk) => {
			stdout += chunk;
		});
		parent.stderr.on('data', (chunk) => {
			stderr += chunk;
		});

		let childPid = 0;
		try {
			await waitFor('the parent to report the forked pid', BOOT_TIMEOUT_MS, () =>
				/^\d+\s/.test(stdout),
			);
			childPid = Number.parseInt(stdout.trim().split('\n')[0] ?? '0', 10);
			expect(childPid).toBeGreaterThan(0);

			await waitFor(
				`the server to listen on ${port}${stderr === '' ? '' : `\n${stderr}`}`,
				BOOT_TIMEOUT_MS,
				() => isListening(port),
			);

			// The parent is alive right up to the kill, so a child that dies here
			// died because the pipe closed rather than because the parent had gone
			// home on its own.
			expect(isRunning(parent.pid ?? 0)).toBe(true);
			forceKill(parent.pid ?? 0);

			await waitFor('the forked server to exit', EXIT_TIMEOUT_MS, () => !isRunning(childPid));
			await waitFor('the port to be released', EXIT_TIMEOUT_MS, async () => !(await isListening(port)));
		} finally {
			forceKill(parent.pid ?? 0);
			if (childPid > 0) {
				forceKill(childPid);
			}
		}
	}, 120_000);
});
