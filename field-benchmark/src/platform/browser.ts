import type { Platform } from './types';

const LOG_KEY = 'bench:log';

/** The Vite dev page in a desktop browser: in-memory collections, no local basemap. */
export function browserPlatform(): Platform {
	return {
		name: 'browser',
		persistence: async () => null,
		dbSizeBytes: async () => null,
		wipe: async () => location.reload(),
		basemapInfo: async () => null,
		downloadBasemap: async () => {
			throw new Error('No local basemap in a browser; the map reads the LAN copy remotely.');
		},
		basemapSource: () => null,
		sinceProcessStartMs: async () => performance.now(),
		appendLog: async (line) => {
			try {
				localStorage.setItem(LOG_KEY, `${localStorage.getItem(LOG_KEY) ?? ''}${line}\n`);
			} catch {}
		},
		readLog: async () => {
			try {
				return localStorage.getItem(LOG_KEY) ?? '';
			} catch {
				return '';
			}
		},
		shareLog: async (text) => {
			await navigator.clipboard.writeText(text);
		},
		recovery: async () => null,
		clearRecovery: async () => {},
		killRenderer: async () => {},
		canKillRenderer: false,
	};
}
