/**
 * The dev runner's process supervision, driven by a fake entry.
 *
 * The four failure modes below are the ones a person will not notice quickly,
 * because the runner keeps printing the same lines either way: a change dropped
 * mid-restart, a restart called finished before the port is bound, a stop that
 * leaves the old process holding the port, and a boot failure that spins. #281
 * survived a hand check for exactly that reason.
 *
 * Nothing here forks, binds a port, or watches a file. The fake entry reports
 * listening on demand and ignores shutdown on demand, which is all four paths.
 */

import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RUNNER_SHUTDOWN_MESSAGE, serverListeningMessage } from '../../../dev/dev-ipc.js';
import {
	createDevChildLifecycle,
	createDevSupervisor,
	type DevChildLifecycle,
	type DevChildProcess,
	type DevLogger,
	type DevSupervisor,
} from '../../../dev/dev-supervisor.js';

const SHUTDOWN_GRACE_MS = 10_000;
const STARTUP_TIMEOUT_MS = 60_000;
const RESTART_DEBOUNCE_MS = 250;

/** A forked server that answers, or refuses to answer, on command. */
class FakeServerEntry extends EventEmitter implements DevChildProcess {
	readonly pid = 4242;
	connected = true;
	readonly sent: unknown[] = [];
	readonly signals: NodeJS.Signals[] = [];

	send(message: typeof RUNNER_SHUTDOWN_MESSAGE): boolean {
		this.sent.push(message);
		return true;
	}

	kill(signal: NodeJS.Signals): boolean {
		this.signals.push(signal);
		return true;
	}

	reportListening(): void {
		this.emit('message', serverListeningMessage(3000));
	}

	reportExit(code: number | null = 0, signal: NodeJS.Signals | null = null): void {
		this.emit('exit', code, signal);
	}
}

function silentLogger(): DevLogger {
	return { log: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

/** A lifecycle whose start is held open until the test releases it. */
function heldLifecycle(trace: string[]): DevChildLifecycle & { releaseStart(): void } {
	let release: (() => void) | null = null;

	return {
		start(): Promise<void> {
			trace.push('start:begin');
			return new Promise<void>((resolve) => {
				release = () => {
					trace.push('start:end');
					resolve();
				};
			});
		},
		stop(): Promise<void> {
			trace.push('stop');
			return Promise.resolve();
		},
		releaseStart(): void {
			release?.();
			release = null;
		},
	};
}

/** Drives the first build, port guard, and child start to completion. */
async function bootSupervisor(
	supervisor: DevSupervisor,
	child: { releaseStart(): void },
): Promise<void> {
	const started = supervisor.start();
	await vi.advanceTimersByTimeAsync(0);
	child.releaseStart();
	await started;
}

beforeEach(() => {
	vi.useFakeTimers();
});

afterEach(() => {
	vi.useRealTimers();
});

describe('createDevChildLifecycle', () => {
	function lifecycleUnderTest(entries: FakeServerEntry[] = []) {
		const logger = silentLogger();
		const killed: (number | undefined)[] = [];
		const forked: FakeServerEntry[] = [];
		const killProcessTree = vi.fn(async (pid: number | undefined) => {
			killed.push(pid);
			// A tree kill is what finally ends a child that ignored the request.
			forked.at(-1)?.reportExit(null, 'SIGKILL');
			await Promise.resolve();
		});
		const lifecycle = createDevChildLifecycle({
			forkServer: () => {
				const entry = entries.shift() ?? new FakeServerEntry();
				forked.push(entry);
				return entry;
			},
			killProcessTree,
			logger,
			shutdownGraceMs: SHUTDOWN_GRACE_MS,
			startupTimeoutMs: STARTUP_TIMEOUT_MS,
		});

		return { lifecycle, logger, forked, killed };
	}

	it('does not resolve the start until the child reports it is listening', async () => {
		const entry = new FakeServerEntry();
		const { lifecycle } = lifecycleUnderTest([entry]);
		const order: string[] = [];

		const started = lifecycle.start().then(() => order.push('started'));
		await vi.advanceTimersByTimeAsync(5_000);
		expect(order).toEqual([]);

		order.push('listening');
		entry.reportListening();
		await started;

		expect(order).toEqual(['listening', 'started']);
	});

	it('waits for the next change when the child exits during boot', async () => {
		const entry = new FakeServerEntry();
		const { lifecycle, logger, forked } = lifecycleUnderTest([entry]);

		const started = lifecycle.start();
		entry.reportExit(1);
		await started;

		// One fork, not a loop, and the run does not hang on the dead child.
		expect(forked).toHaveLength(1);
		expect(logger.error).toHaveBeenCalledTimes(1);

		// The child is already gone, so there is nothing left to stop.
		await lifecycle.stop();
		expect(entry.sent).toEqual([]);
		expect(entry.signals).toEqual([]);
	});

	it('asks the child to close over IPC when the channel is open', async () => {
		const entry = new FakeServerEntry();
		const { lifecycle, killed } = lifecycleUnderTest([entry]);

		const started = lifecycle.start();
		entry.reportListening();
		await started;

		const stopped = lifecycle.stop();
		expect(entry.sent).toEqual([RUNNER_SHUTDOWN_MESSAGE]);
		expect(entry.signals).toEqual([]);

		entry.reportExit(0);
		await stopped;
		expect(killed).toEqual([]);
	});

	it('falls back to a signal when the IPC channel is already gone', async () => {
		const entry = new FakeServerEntry();
		const { lifecycle } = lifecycleUnderTest([entry]);

		const started = lifecycle.start();
		entry.reportListening();
		await started;
		entry.connected = false;

		const stopped = lifecycle.stop();
		expect(entry.sent).toEqual([]);
		expect(entry.signals).toEqual(['SIGTERM']);

		entry.reportExit(null, 'SIGTERM');
		await stopped;
	});

	it('kills the process tree once the grace period passes with no exit', async () => {
		const entry = new FakeServerEntry();
		const { lifecycle, logger, killed } = lifecycleUnderTest([entry]);

		const started = lifecycle.start();
		entry.reportListening();
		await started;

		// The fake entry ignores the shutdown request, as a wedged server does.
		const stopped = lifecycle.stop();
		await vi.advanceTimersByTimeAsync(SHUTDOWN_GRACE_MS - 1);
		expect(killed).toEqual([]);

		await vi.advanceTimersByTimeAsync(1);
		await stopped;

		expect(killed).toEqual([entry.pid]);
		expect(logger.warn).toHaveBeenCalledTimes(1);
	});
});

describe('createDevSupervisor', () => {
	function supervisorUnderTest(child: DevChildLifecycle, trace: string[]) {
		const logger = silentLogger();
		const supervisor = createDevSupervisor({
			child,
			buildDependencies: async () => {
				trace.push('build');
				await Promise.resolve();
			},
			ensurePortIsFree: async () => {
				trace.push('port');
				await Promise.resolve();
				return true;
			},
			port: 3000,
			restartDebounceMs: RESTART_DEBOUNCE_MS,
			logger,
		});

		return { supervisor, logger };
	}

	it('builds and clears the port before the first child starts', async () => {
		const trace: string[] = [];
		const child = heldLifecycle(trace);
		const { supervisor } = supervisorUnderTest(child, trace);

		const start = supervisor.start();
		await vi.advanceTimersByTimeAsync(0);
		expect(trace).toEqual(['build', 'port', 'start:begin']);

		child.releaseStart();
		await start;
		expect(trace).toEqual(['build', 'port', 'start:begin', 'start:end']);
	});

	it('collapses several changes inside the debounce window into one restart', async () => {
		const trace: string[] = [];
		const child = heldLifecycle(trace);
		const { supervisor } = supervisorUnderTest(child, trace);

		await bootSupervisor(supervisor, child);
		trace.length = 0;

		supervisor.notifyChange();
		await vi.advanceTimersByTimeAsync(RESTART_DEBOUNCE_MS - 50);
		supervisor.notifyChange();
		supervisor.notifyChange();
		await vi.advanceTimersByTimeAsync(RESTART_DEBOUNCE_MS);
		child.releaseStart();
		await vi.advanceTimersByTimeAsync(0);

		expect(trace).toEqual(['stop', 'build', 'port', 'start:begin', 'start:end']);
	});

	it('queues a change that lands mid-restart into exactly one further restart', async () => {
		const trace: string[] = [];
		const child = heldLifecycle(trace);
		const { supervisor } = supervisorUnderTest(child, trace);

		await bootSupervisor(supervisor, child);
		trace.length = 0;

		supervisor.notifyChange();
		await vi.advanceTimersByTimeAsync(RESTART_DEBOUNCE_MS);
		expect(trace).toEqual(['stop', 'build', 'port', 'start:begin']);

		// Two edits saved while the first restart is still binding the port.
		supervisor.notifyChange();
		supervisor.notifyChange();
		child.releaseStart();
		await vi.advanceTimersByTimeAsync(0);

		// The first restart finishes, then one more runs for both edits.
		expect(trace).toEqual([
			'stop',
			'build',
			'port',
			'start:begin',
			'start:end',
			'stop',
			'build',
			'port',
			'start:begin',
		]);

		child.releaseStart();
		await vi.advanceTimersByTimeAsync(RESTART_DEBOUNCE_MS * 4);
		expect(trace.filter((step) => step === 'start:begin')).toHaveLength(2);
	});

	it('drops a scheduled restart once the runner is stopping', async () => {
		const trace: string[] = [];
		const child = heldLifecycle(trace);
		const { supervisor } = supervisorUnderTest(child, trace);

		await bootSupervisor(supervisor, child);
		trace.length = 0;

		supervisor.notifyChange();
		await supervisor.stop();
		await vi.advanceTimersByTimeAsync(RESTART_DEBOUNCE_MS * 4);

		expect(trace).toEqual(['stop']);
		supervisor.notifyChange();
		await vi.advanceTimersByTimeAsync(RESTART_DEBOUNCE_MS * 4);
		expect(trace).toEqual(['stop']);
	});
});
