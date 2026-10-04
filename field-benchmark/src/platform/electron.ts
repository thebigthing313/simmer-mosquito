import { createElectronSQLitePersistence } from '@tanstack/electron-db-sqlite-persistence/renderer';
import type { Source } from 'pmtiles';
import type { Platform } from './types';

export type ElectronBridge = {
	invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
	onDownloadProgress: (cb: (bytes: number) => void) => () => void;
};

declare global {
	interface Window {
		benchElectron?: ElectronBridge;
	}
}

/** Range reads answered by the main process over IPC (#1359, item 9). */
class IpcRangeSource implements Source {
	constructor(private bridge: ElectronBridge) {}
	getKey() {
		return 'local-basemap';
	}
	async getBytes(offset: number, length: number) {
		const data = (await this.bridge.invoke('bench:range', offset, length)) as Uint8Array;
		return {
			data: data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer,
		};
	}
}

export function electronPlatform(bridge: ElectronBridge): Platform {
	let hasBasemap = false;
	return {
		name: 'electron',
		persistence: async () =>
			createElectronSQLitePersistence({
				invoke: (channel: string, request: unknown) => bridge.invoke(channel, request) as never,
			}),
		dbSizeBytes: async () => (await bridge.invoke('bench:db-size')) as number,
		wipe: async () => {
			await bridge.invoke('bench:wipe');
		},
		basemapInfo: async () => {
			const info = (await bridge.invoke('bench:basemap-info')) as { bytes: number } | null;
			hasBasemap = info !== null;
			return info;
		},
		downloadBasemap: async (url, onProgress) => {
			const off = bridge.onDownloadProgress(onProgress);
			try {
				const result = (await bridge.invoke('bench:download-basemap', url)) as { bytes: number };
				hasBasemap = true;
				return result;
			} finally {
				off();
			}
		},
		basemapSource: () => (hasBasemap ? new IpcRangeSource(bridge) : null),
		sinceProcessStartMs: async () => (await bridge.invoke('bench:since-process-start')) as number,
		appendLog: async (line) => {
			await bridge.invoke('bench:append-log', line);
		},
		readLog: async () => (await bridge.invoke('bench:read-log')) as string,
		shareLog: async (text) => {
			await bridge.invoke('bench:share-log', text);
		},
		recovery: async () => null,
		clearRecovery: async () => {},
		killRenderer: async () => {},
		canKillRenderer: false,
	};
}
