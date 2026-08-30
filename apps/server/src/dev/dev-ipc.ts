// The two messages the dev runner and the forked server exchange. Both halves
// import them from here so the strings cannot drift apart: the server answers a
// bind with `simmer:listening`, and the runner asks for a close with
// `simmer:shutdown` because a signal on Windows is a TerminateProcess that no
// handler sees.
import { isRecord } from '../command-payload.js';

export interface ServerListeningMessage {
	type: 'simmer:listening';
	port: number;
}

export interface RunnerShutdownMessage {
	type: 'simmer:shutdown';
}

export const RUNNER_SHUTDOWN_MESSAGE: RunnerShutdownMessage = { type: 'simmer:shutdown' };

export function serverListeningMessage(port: number): ServerListeningMessage {
	return { type: 'simmer:listening', port };
}

export function isServerListeningMessage(message: unknown): message is ServerListeningMessage {
	return isRecord(message) && message.type === 'simmer:listening';
}

export function isRunnerShutdownMessage(message: unknown): message is RunnerShutdownMessage {
	return isRecord(message) && message.type === 'simmer:shutdown';
}
