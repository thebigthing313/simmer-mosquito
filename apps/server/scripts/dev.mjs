// The dev runner restarts the server *process*, not the server module.
//
// It used to re-import `../src/main.ts?devRestart=N` in-process. Node's ESM
// loader keys its cache by resolved URL, so the query made `main.ts` fresh and
// left every module it imports on the copy it had at process start. A restart
// reloaded one file out of the hundreds being watched and printed the same
// "Server listening" line either way, including after `tsc -b` had visibly
// rebuilt five workspace packages. See issue #281.
//
// Forking gets module freshness for free. What it costs is a graceful stop:
// the old process has to be gone before the new one binds, so `stopChild` waits
// for the exit and `ensurePortIsFree` is left as a guard rather than the
// mechanism.
import { fork, spawn } from 'node:child_process';
import { watch } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import process from 'node:process';

const isWindows = process.platform === 'win32';
const pnpmCommand = isWindows ? 'pnpm.cmd' : 'pnpm';
const serverEntry = resolve('src/main.ts');
const serverPort = await readConfiguredPort();
const shutdownGraceMs = 10_000;
const startupTimeoutMs = 60_000;
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

let child = null;
let restartTimer;
let isRestarting = false;
let isStopping = false;
let pendingChange = false;

await buildServerDependencies();

if (!(await ensurePortIsFree(serverPort, shutdownGraceMs))) {
	throw new Error(`Port ${serverPort} is still in use after stale listener cleanup.`);
}

await startChild();

const watchers = watchedSourceRoots.map((sourceRoot) =>
	watch(sourceRoot, { recursive: true }, (_eventType, filename) => {
		if (filename === null || !/\.[cm]?[tj]sx?$/.test(filename)) {
			return;
		}

		scheduleRestart();
	}),
);

process.once('SIGINT', () => {
	void stopDevServer(130);
});

process.once('SIGTERM', () => {
	void stopDevServer(143);
});

async function stopDevServer(exitCode) {
	if (isStopping) {
		return;
	}

	isStopping = true;
	clearTimeout(restartTimer);
	closeWatchers();
	await stopChild();
	process.exit(exitCode);
}

function scheduleRestart() {
	if (isStopping) {
		return;
	}

	// A change that lands mid-restart is not dropped. The build reads the file
	// tree at the moment it runs, so an edit made during one is not guaranteed
	// to be in it, and re-running is cheaper than serving a stale module again.
	if (isRestarting) {
		pendingChange = true;
		return;
	}

	clearTimeout(restartTimer);
	restartTimer = setTimeout(() => {
		restartTimer = undefined;
		void restartServer();
	}, 250);
}

async function restartServer() {
	if (isRestarting || isStopping) {
		return;
	}

	isRestarting = true;
	try {
		do {
			pendingChange = false;
			await replaceChild();
		} while (pendingChange && !isStopping);
	} catch (error) {
		console.error(error);
	} finally {
		isRestarting = false;
	}
}

// One stop, build, start cycle. `ensurePortIsFree` is a guard here rather than
// the mechanism: `stopChild` has already waited for the old process to exit, so
// a listener still on the port is something this runner did not start.
async function replaceChild() {
	console.log('[dev] Change detected. Stopping the server...');
	await stopChild();
	await buildServerDependencies();
	if (!(await ensurePortIsFree(serverPort, shutdownGraceMs))) {
		throw new Error(`Port ${serverPort} is still in use after restart cleanup.`);
	}

	await startChild();
}

// Resolves once the forked process has reported it is listening, or has exited
// trying. The runner prints nothing that claims the server is live: the "Server
// listening on ..." line comes from the server itself, on the same stdout.
function startChild() {
	const started = fork(serverEntry, [], {
		stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
		windowsHide: true,
	});
	child = started;

	return new Promise((resolveStart) => {
		const startupTimer = setTimeout(() => {
			console.warn(
				`[dev] The server has not reported a listener after ${startupTimeoutMs / 1000}s. Still waiting; edit a watched file to restart it.`,
			);
			finish();
		}, startupTimeoutMs);
		startupTimer.unref();

		function finish() {
			clearTimeout(startupTimer);
			started.off('message', onMessage);
			started.off('exit', onExit);
			resolveStart();
		}

		function onMessage(message) {
			if (message !== null && typeof message === 'object' && message.type === 'simmer:listening') {
				finish();
			}
		}

		function onExit(code, signal) {
			if (child === started) {
				child = null;
				console.error(
					`[dev] The server exited with ${signal ?? `code ${code ?? 'unknown'}`}. Edit a watched file to start it again.`,
				);
			}

			finish();
		}

		started.on('message', onMessage);
		started.once('exit', onExit);
		started.on('error', (error) => {
			console.error(error);
			finish();
		});
	});
}

// Asks the server to close over IPC, because on Windows a SIGTERM sent to
// another process is a TerminateProcess and the handler in `main.ts` never
// runs. Falls back to a signal, then to a forced kill, so the port is free
// before the replacement binds.
async function stopChild() {
	const stopping = child;
	if (stopping === null) {
		return;
	}

	child = null;
	const exited = new Promise((resolveExit) => {
		stopping.once('exit', () => resolveExit(true));
	});

	if (stopping.connected) {
		stopping.send({ type: 'simmer:shutdown' });
	} else {
		stopping.kill('SIGTERM');
	}

	const stoppedInTime = await Promise.race([exited, delay(shutdownGraceMs).then(() => false)]);
	if (stoppedInTime) {
		return;
	}

	console.warn(
		`[dev] The server did not close within ${shutdownGraceMs / 1000}s. Killing process ${stopping.pid}.`,
	);
	await killProcessTree(stopping.pid);
	await exited;
}

async function buildServerDependencies() {
	for (const packageName of serverDependencyPackages) {
		await run(pnpmCommand, ['--filter', packageName, 'build']);
	}
}

function closeWatchers() {
	for (const watcher of watchers) {
		watcher.close();
	}
}

function run(command, args) {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, {
			shell: isWindows,
			stdio: 'inherit',
			windowsHide: true,
		});

		child.on('error', reject);
		child.on('exit', (code, signal) => {
			if (code === 0) {
				resolve();
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

async function readConfiguredPort() {
	for (const envPath of [resolve('../../.env'), resolve('.env')]) {
		const port = await readPortFromEnvFile(envPath);
		if (port !== null) {
			return port;
		}
	}

	return Number.parseInt(process.env.PORT ?? '3000', 10);
}

async function readPortFromEnvFile(envPath) {
	let contents;
	try {
		contents = await readFile(envPath, 'utf8');
	} catch {
		return null;
	}

	for (const line of contents.split(/\r?\n/)) {
		const match = /^PORT\s*=\s*"?(\d+)"?\s*$/.exec(line.trim());
		if (match !== null) {
			return Number.parseInt(match[1], 10);
		}
	}

	return null;
}

async function ensurePortIsFree(port, timeoutMs) {
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

function findPortListener(port) {
	if (!isWindows) {
		return Promise.resolve(null);
	}

	return new Promise((resolve) => {
		const netstat = spawn('netstat', ['-ano', '-p', 'tcp'], {
			stdio: ['ignore', 'pipe', 'ignore'],
			windowsHide: true,
		});
		let output = '';

		netstat.stdout.on('data', (chunk) => {
			output += chunk;
		});
		netstat.on('error', () => resolve(null));
		netstat.on('exit', () => {
			for (const line of output.split(/\r?\n/)) {
				const columns = line.trim().split(/\s+/);
				if (
					columns.length >= 5 &&
					columns[0] === 'TCP' &&
					columns[1].endsWith(`:${port}`) &&
					columns[3] === 'LISTENING'
				) {
					resolve(Number.parseInt(columns[4], 10));
					return;
				}
			}

			resolve(null);
		});
	});
}

function killProcessTree(pid) {
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

	return new Promise((resolve) => {
		const taskkill = spawn('taskkill', ['/PID', String(pid), '/T', '/F'], {
			stdio: 'ignore',
			windowsHide: true,
		});

		taskkill.on('error', () => {
			void stopProcess(pid).finally(resolve);
		});
		taskkill.on('exit', (code) => {
			void (async () => {
				if (code !== 0 || isProcessRunning(pid)) {
					await stopProcess(pid);
				}
				resolve();
			})();
		});
	});
}

function isProcessRunning(pid) {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

function stopProcess(pid) {
	return new Promise((resolve) => {
		const powershell = spawn(
			'powershell',
			['-NoProfile', '-Command', `Stop-Process -Id ${pid} -Force`],
			{
				stdio: 'ignore',
				windowsHide: true,
			},
		);

		powershell.on('error', () => resolve());
		powershell.on('exit', () => resolve());
	});
}

function delay(ms) {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}
