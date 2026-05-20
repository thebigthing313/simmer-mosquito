import { spawn } from 'node:child_process';
import process from 'node:process';

const isWindows = process.platform === 'win32';
const pnpmCommand = isWindows ? 'pnpm.cmd' : 'pnpm';
const tsxCommand = isWindows ? 'tsx.cmd' : 'tsx';

for (const packageName of [
	'@simmer-mosquito/config',
	'@simmer-mosquito/auth',
	'@simmer-mosquito/db',
]) {
	await run(pnpmCommand, ['--filter', packageName, 'build']);
}

const server = spawn(
	tsxCommand,
	['watch', '--env-file-if-exists=../../.env', '--env-file-if-exists=.env', 'src/main.ts'],
	{
		shell: isWindows,
		stdio: 'inherit',
		windowsHide: true,
	},
);

let isStopping = false;

process.once('SIGINT', () => {
	void stopServer('SIGINT', 130);
});

process.once('SIGTERM', () => {
	void stopServer('SIGTERM', 143);
});

server.on('exit', (code, signal) => {
	if (isStopping) {
		return;
	}

	if (signal !== null) {
		process.exit(signal === 'SIGINT' ? 130 : 143);
	}

	process.exit(code ?? 0);
});

server.on('error', (error) => {
	console.error(error);
	process.exit(1);
});

async function stopServer(signal, exitCode) {
	if (isStopping) {
		return;
	}

	isStopping = true;

	server.kill(signal);
	const exited = await waitForExit(server, 2000);
	if (!exited) {
		await killProcessTree(server.pid);
	}

	process.exit(exitCode);
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

function waitForExit(child, timeoutMs) {
	return new Promise((resolve) => {
		if (child.exitCode !== null || child.signalCode !== null) {
			resolve(true);
			return;
		}

		const timeout = setTimeout(() => {
			cleanup();
			resolve(false);
		}, timeoutMs);
		const onExit = () => {
			cleanup();
			resolve(true);
		};
		const cleanup = () => {
			clearTimeout(timeout);
			child.off('exit', onExit);
		};

		child.once('exit', onExit);
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

		taskkill.on('error', () => resolve());
		taskkill.on('exit', () => resolve());
	});
}
