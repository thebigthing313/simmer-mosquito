/**
 * `pnpm dev:server`. The platform half of the dev runner: it forks the server,
 * builds the workspace packages the server imports, watches the source roots,
 * clears a stale listener off the port, and kills a process tree when a child
 * will not close. Every rule about *when* those happen lives in
 * `dev-supervisor.ts`, which is where the tests drive them.
 *
 * Paths here are resolved against the working directory, which is `apps/server`
 * for both `pnpm dev:server` and `pnpm --filter @simmer-mosquito/server dev`.
 */
import { fork, spawn } from 'node:child_process';
import { watch } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import process from 'node:process';
import {
	createDevChildLifecycle,
	createDevSupervisor,
	delay,
	RESTART_DEBOUNCE_MS,
	SHUTDOWN_GRACE_MS,
	STARTUP_TIMEOUT_MS,
} from './dev-supervisor.js';

const isWindows = process.platform === 'win32';
const pnpmCommand = isWindows ? 'pnpm.cmd' : 'pnpm';
const serverEntry = resolve('src/main.ts');
const serverPort = await readConfiguredPort();
const serverDependencyPackages = [
	'@simmer-mosquito/config',
	'@simmer-mosquito/auth',
	'@simmer-mosquito/db',
	'@simmer-mosquito/domain',
	'@simmer-mosquito/sync',
];
const watchedSourceRoots = [
	resolve('src'),
	resolve('../../packages/config/src'),
	resolve('../../packages/auth/src'),
	resolve('../../packages/db/src'),
	resolve('../../packages/domain/src'),
	resolve('../../packages/sync/src'),
];

const supervisor = createDevSupervisor({
	child: createDevChildLifecycle({
		// `ForkOptions` has no `windowsHide`, unlike `SpawnOptions` below. The
		// child inherits this terminal and is not detached, so it opens no window
		// of its own to hide.
		forkServer: () =>
			fork(serverEntry, [], {
				stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
			}),
		killProcessTree,
		logger: console,
		shutdownGraceMs: SHUTDOWN_GRACE_MS,
		startupTimeoutMs: STARTUP_TIMEOUT_MS,
	}),
	buildDependencies: buildServerDependencies,
	ensurePortIsFree: () => ensurePortIsFree(serverPort, SHUTDOWN_GRACE_MS),
	port: serverPort,
	restartDebounceMs: RESTART_DEBOUNCE_MS,
	logger: console,
});

await supervisor.start();

const watchers = watchedSourceRoots.map((sourceRoot) =>
	watch(sourceRoot, { recursive: true }, (_eventType, filename) => {
		if (filename === null || !/\.[cm]?[tj]sx?$/.test(filename)) {
			return;
		}

		supervisor.notifyChange();
	}),
);

process.once('SIGINT', () => {
	void stopDevServer(130);
});

process.once('SIGTERM', () => {
	void stopDevServer(143);
});

async function stopDevServer(exitCode: number): Promise<void> {
	for (const watcher of watchers) {
		watcher.close();
	}

	await supervisor.stop();
	process.exit(exitCode);
}

async function buildServerDependencies(): Promise<void> {
	for (const packageName of serverDependencyPackages) {
		await run(pnpmCommand, ['--filter', packageName, 'build']);
	}
}

function run(command: string, args: string[]): Promise<void> {
	return new Promise((resolveRun, reject) => {
		const child = spawn(command, args, {
			shell: isWindows,
			stdio: 'inherit',
			windowsHide: true,
		});

		child.on('error', reject);
		child.on('exit', (code, signal) => {
			if (code === 0) {
				resolveRun();
				return;
			}

			reject(
				new Error(
					`${command} ${args.join(' ')} exited with ${signal ?? `code ${code ?? 'unknown'}`}`,
				),
			);
		});
	});
}

async function readConfiguredPort(): Promise<number> {
	for (const envPath of [resolve('../../.env'), resolve('.env')]) {
		const port = await readPortFromEnvFile(envPath);
		if (port !== null) {
			return port;
		}
	}

	return Number.parseInt(process.env.PORT ?? '3000', 10);
}

async function readPortFromEnvFile(envPath: string): Promise<number | null> {
	const contents = await readFileOrNull(envPath);
	return contents === null ? null : readPortFromEnvText(contents);
}

async function readFileOrNull(path: string): Promise<string | null> {
	try {
		return await readFile(path, 'utf8');
	} catch {
		return null;
	}
}

function readPortFromEnvText(contents: string): number | null {
	for (const line of contents.split(/\r?\n/)) {
		const configured = /^PORT\s*=\s*"?(\d+)"?\s*$/.exec(line.trim())?.[1];
		if (configured !== undefined) {
			return Number.parseInt(configured, 10);
		}
	}

	return null;
}

async function ensurePortIsFree(port: number, timeoutMs: number): Promise<boolean> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		const pid = await findPortListener(port);
		if (pid === null) {
			return true;
		}

		console.warn(`Killing stale process ${pid} still listening on port ${port}.`);
		await killProcessTree(pid);
		await delay(250);
	}

	return false;
}

function findPortListener(port: number): Promise<number | null> {
	if (!isWindows) {
		return Promise.resolve(null);
	}

	return new Promise((resolveListener) => {
		const netstat = spawn('netstat', ['-ano', '-p', 'tcp'], {
			stdio: ['ignore', 'pipe', 'ignore'],
			windowsHide: true,
		});
		let output = '';

		netstat.stdout.on('data', (chunk) => {
			output += chunk;
		});
		netstat.on('error', () => resolveListener(null));
		netstat.on('exit', () => resolveListener(readListenerPid(output, port)));
	});
}

/**
 * The owning PID of the first `netstat -ano` row listening on `port`. The five
 * columns are protocol, local address, foreign address, state, PID.
 */
function readListenerPid(output: string, port: number): number | null {
	const row = new RegExp(`^\\s*TCP\\s+\\S+:${port}\\s+\\S+\\s+LISTENING\\s+(\\d+)\\s*$`, 'm');
	const owningPid = row.exec(output)?.[1];
	return owningPid === undefined ? null : Number.parseInt(owningPid, 10);
}

function killProcessTree(pid: number | undefined): Promise<void> {
	if (pid === undefined) {
		return Promise.resolve();
	}

	if (!isWindows) {
		try {
			process.kill(pid, 'SIGKILL');
		} catch {
			// The process may have exited between the graceful wait and the force kill.
		}
		return Promise.resolve();
	}

	return new Promise((resolveKill) => {
		const taskkill = spawn('taskkill', ['/PID', String(pid), '/T', '/F'], {
			stdio: 'ignore',
			windowsHide: true,
		});

		taskkill.on('error', () => {
			void stopProcess(pid).finally(resolveKill);
		});
		taskkill.on('exit', (code) => {
			void (async () => {
				if (code !== 0 || isProcessRunning(pid)) {
					await stopProcess(pid);
				}
				resolveKill();
			})();
		});
	});
}

function isProcessRunning(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

function stopProcess(pid: number): Promise<void> {
	return new Promise((resolveStop) => {
		const powershell = spawn(
			'powershell',
			['-NoProfile', '-Command', `Stop-Process -Id ${pid} -Force`],
			{
				stdio: 'ignore',
				windowsHide: true,
			},
		);

		powershell.on('error', () => resolveStop());
		powershell.on('exit', () => resolveStop());
	});
}
