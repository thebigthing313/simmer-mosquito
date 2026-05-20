import { spawn } from 'node:child_process';
import { watch } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import process from 'node:process';

const isWindows = process.platform === 'win32';
const pnpmCommand = isWindows ? 'pnpm.cmd' : 'pnpm';
const serverPort = await readConfiguredPort();

for (const packageName of [
	'@simmer-mosquito/config',
	'@simmer-mosquito/auth',
	'@simmer-mosquito/db',
]) {
	await run(pnpmCommand, ['--filter', packageName, 'build']);
}

if (!(await ensurePortIsFree(serverPort, 10_000))) {
	throw new Error(`Port ${serverPort} is still in use after stale listener cleanup.`);
}

let restartId = 0;
let restartTimer;
let activeModule = await importServer();
let isRestarting = false;
let isStopping = false;

const watcher = watch(resolve('src'), { recursive: true }, (_eventType, filename) => {
	if (filename === null || !/\.[cm]?[tj]sx?$/.test(filename)) {
		return;
	}

	scheduleRestart();
});

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
	watcher.close();
	await disposeActiveModule();
	process.exit(exitCode);
}

function scheduleRestart() {
	if (isStopping) {
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
		console.log('Restarting server...');
		await disposeActiveModule();
		if (!(await ensurePortIsFree(serverPort, 10_000))) {
			throw new Error(`Port ${serverPort} is still in use after restart cleanup.`);
		}

		activeModule = await importServer();
	} catch (error) {
		console.error(error);
	} finally {
		isRestarting = false;
	}
}

async function importServer() {
	restartId += 1;
	return import(`../src/main.ts?devRestart=${restartId}`);
}

async function disposeActiveModule() {
	await activeModule.disposeServerForRestart?.();
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
