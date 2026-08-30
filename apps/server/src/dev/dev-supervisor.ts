/**
 * The dev runner's process supervision, with nothing platform-specific in it.
 *
 * The runner restarts the server *process*, not the server module. It used to
 * re-import `../main.ts?devRestart=N` in-process, and Node's ESM loader keys its
 * cache by resolved URL, so the query made `main.ts` fresh and left every module
 * it imports on the copy it had at process start (issue #281). Forking gets
 * module freshness for free; what it costs is a graceful stop, which is most of
 * what is below.
 *
 * Everything here is driven through collaborators the caller supplies: a fork, a
 * tree kill, a build, a port guard, a logger. `run-dev-server.ts` wires the real
 * ones. That is the seam — the rules about lifecycle are testable with a fake
 * child, no port bound and no server booted (issue #311).
 */
import { isServerListeningMessage, RUNNER_SHUTDOWN_MESSAGE } from './dev-ipc.js';

/** How long a child gets to close itself before it is killed. */
export const SHUTDOWN_GRACE_MS = 10_000;
/** How long the runner waits for a `simmer:listening` before it stops blocking. */
export const STARTUP_TIMEOUT_MS = 60_000;
/** How long changes collect before one restart runs for all of them. */
export const RESTART_DEBOUNCE_MS = 250;

export interface DevLogger {
	log(message: string): void;
	warn(message: string): void;
	error(error: unknown): void;
}

/**
 * The part of a forked child this module uses. Node's `ChildProcess` satisfies
 * it, and so does a fake entry that reports listening on demand.
 */
export interface DevChildProcess {
	readonly pid?: number | undefined;
	readonly connected: boolean;
	send(message: typeof RUNNER_SHUTDOWN_MESSAGE): unknown;
	kill(signal: NodeJS.Signals): unknown;
	on(event: 'message', listener: (message: unknown) => void): unknown;
	on(event: 'error', listener: (error: Error) => void): unknown;
	once(event: 'exit', listener: DevChildExitListener): unknown;
	off(event: 'message', listener: (message: unknown) => void): unknown;
	off(event: 'exit', listener: DevChildExitListener): unknown;
}

export type DevChildExitListener = (code: number | null, signal: NodeJS.Signals | null) => void;

export interface DevChildLifecycleOptions {
	forkServer: () => DevChildProcess;
	killProcessTree: (pid: number | undefined) => Promise<void>;
	logger: DevLogger;
	shutdownGraceMs: number;
	startupTimeoutMs: number;
}

export interface DevChildLifecycle {
	/** Forks a child and resolves once it reports it is listening, or exits trying. */
	start(): Promise<void>;
	/** Asks the running child to close and resolves once it is gone. */
	stop(): Promise<void>;
}

export function createDevChildLifecycle(options: DevChildLifecycleOptions): DevChildLifecycle {
	const { forkServer, killProcessTree, logger, shutdownGraceMs, startupTimeoutMs } = options;
	let child: DevChildProcess | null = null;

	// Resolves once the forked process has reported it is listening, or has
	// exited trying. The runner prints nothing that claims the server is live:
	// the "Server listening on ..." line comes from the server itself.
	function start(): Promise<void> {
		const started = forkServer();
		child = started;

		return new Promise<void>((resolveStart) => {
			const startupTimer = setTimeout(() => {
				logger.warn(
					`[dev] The server has not reported a listener after ${startupTimeoutMs / 1000}s. Still waiting; edit a watched file to restart it.`,
				);
				finish();
			}, startupTimeoutMs);
			startupTimer.unref?.();

			function finish(): void {
				clearTimeout(startupTimer);
				started.off('message', onMessage);
				started.off('exit', onExit);
				resolveStart();
			}

			function onMessage(message: unknown): void {
				if (isServerListeningMessage(message)) {
					finish();
				}
			}

			function onExit(code: number | null, signal: NodeJS.Signals | null): void {
				// A child that dies during boot leaves the runner waiting for the
				// next change. Restarting here would spin on a server that cannot
				// start.
				if (child === started) {
					child = null;
					logger.error(
						`[dev] The server exited with ${signal ?? `code ${code ?? 'unknown'}`}. Edit a watched file to start it again.`,
					);
				}

				finish();
			}

			started.on('message', onMessage);
			started.once('exit', onExit);
			started.on('error', (error: Error) => {
				logger.error(error);
				finish();
			});
		});
	}

	// Asks the server to close over IPC, because on Windows a SIGTERM sent to
	// another process is a TerminateProcess and the handler in `main.ts` never
	// runs. Falls back to a signal, then to a forced kill, so the port is free
	// before the replacement binds.
	async function stop(): Promise<void> {
		const stopping = child;
		if (stopping === null) {
			return;
		}

		child = null;
		const exited = new Promise<boolean>((resolveExit) => {
			stopping.once('exit', () => resolveExit(true));
		});

		if (stopping.connected) {
			stopping.send(RUNNER_SHUTDOWN_MESSAGE);
		} else {
			stopping.kill('SIGTERM');
		}

		const stoppedInTime = await Promise.race([exited, delay(shutdownGraceMs).then(() => false)]);
		if (stoppedInTime) {
			return;
		}

		logger.warn(
			`[dev] The server did not close within ${shutdownGraceMs / 1000}s. Killing process ${stopping.pid}.`,
		);
		await killProcessTree(stopping.pid);
		await exited;
	}

	return { start, stop };
}

export interface DevSupervisorOptions {
	child: DevChildLifecycle;
	buildDependencies: () => Promise<void>;
	/** Guards the port before a bind; false means something else still holds it. */
	ensurePortIsFree: () => Promise<boolean>;
	port: number;
	restartDebounceMs: number;
	logger: DevLogger;
}

export interface DevSupervisor {
	/** Builds, checks the port, and starts the first child. */
	start(): Promise<void>;
	/** Records that a watched file changed. Restarts once the changes settle. */
	notifyChange(): void;
	/** Stops the child and refuses any further restart. */
	stop(): Promise<void>;
}

export function createDevSupervisor(options: DevSupervisorOptions): DevSupervisor {
	const { child, buildDependencies, ensurePortIsFree, port, restartDebounceMs, logger } = options;
	let restartTimer: ReturnType<typeof setTimeout> | undefined;
	let isRestarting = false;
	let isStopping = false;
	let pendingChange = false;

	async function start(): Promise<void> {
		await buildDependencies();
		await guardPort('stale listener cleanup');
		await child.start();
	}

	function notifyChange(): void {
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
			void restart();
		}, restartDebounceMs);
	}

	async function restart(): Promise<void> {
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
			logger.error(error);
		} finally {
			isRestarting = false;
		}
	}

	// One stop, build, start cycle. The port guard is a guard here rather than
	// the mechanism: the stop has already waited for the old process to exit, so
	// a listener still on the port is something this runner did not start.
	async function replaceChild(): Promise<void> {
		logger.log('[dev] Change detected. Stopping the server...');
		await child.stop();
		await buildDependencies();
		await guardPort('restart cleanup');
		await child.start();
	}

	async function guardPort(stage: string): Promise<void> {
		if (!(await ensurePortIsFree())) {
			throw new Error(`Port ${port} is still in use after ${stage}.`);
		}
	}

	async function stop(): Promise<void> {
		if (isStopping) {
			return;
		}

		isStopping = true;
		clearTimeout(restartTimer);
		restartTimer = undefined;
		await child.stop();
	}

	return { start, notifyChange, stop };
}

export function delay(ms: number): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}
