import type { Platform } from '../platform';

export const BUILD = { app: 'field-benchmark', version: 1 };

export function deviceInfo() {
	const nav = navigator as Navigator & { deviceMemory?: number };
	return {
		userAgent: navigator.userAgent,
		hardwareConcurrency: navigator.hardwareConcurrency,
		deviceMemory: nav.deviceMemory ?? null,
		screen: `${screen.width}x${screen.height}@${devicePixelRatio}`,
		viewport: `${innerWidth}x${innerHeight}`,
	};
}

export type LogEntry = { type: string } & Record<string, unknown>;

type Listener = (entry: LogEntry) => void;
const listeners = new Set<Listener>();

export function onLog(listener: Listener) {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

/** Appends one JSON line to the shell's results file and tells the panel. */
export async function logResult(platform: Platform, entry: LogEntry) {
	const full = { at: new Date().toISOString(), platform: platform.name, ...entry };
	for (const l of listeners) l(full);
	console.info('[bench]', JSON.stringify(full));
	await platform.appendLog(JSON.stringify(full));
}
