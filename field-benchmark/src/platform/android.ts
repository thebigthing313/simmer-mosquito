import { CapacitorSQLite, SQLiteConnection } from '@capacitor-community/sqlite';
import { registerPlugin } from '@capacitor/core';
import { createCapacitorSQLitePersistence } from '@tanstack/capacitor-db-sqlite-persistence';
import type { Source } from 'pmtiles';
import type { Platform, Recovery } from './types';

type BenchNativePlugin = {
	readRange(o: { offset: number; length: number }): Promise<{ data: string }>;
	basemapInfo(): Promise<{ bytes: number; exists: boolean }>;
	downloadBasemap(o: { url: string }): Promise<{ bytes: number }>;
	addListener(
		event: 'downloadProgress',
		cb: (e: { bytes: number }) => void,
	): Promise<{ remove: () => Promise<void> }>;
	dbSize(o: { name: string }): Promise<{ bytes: number }>;
	deleteDatabase(o: { name: string }): Promise<void>;
	sinceProcessStart(): Promise<{ ms: number }>;
	appendLog(o: { line: string }): Promise<void>;
	readLog(): Promise<{ text: string }>;
	shareText(o: { text: string }): Promise<void>;
	getRecovery(): Promise<{ recovery: string | null }>;
	clearRecovery(): Promise<void>;
	killRenderer(o: { kind: string; expectedQueueIds: string }): Promise<void>;
	restartApp(): Promise<void>;
};

const BenchNative = registerPlugin<BenchNativePlugin>('BenchNative');
const bridgeStats = { calls: { run: 0, query: 0, execute: 0 }, ms: 0 };
const DB_NAME = 'bench';

function decodeBase64(b64: string): ArrayBuffer {
	const bin = atob(b64);
	const out = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
	return out.buffer;
}

/** Reads the basemap in the app's files directory through a native range read (#1359, item 9). */
class NativeRangeSource implements Source {
	getKey() {
		return 'local-basemap';
	}
	async getBytes(offset: number, length: number) {
		const { data } = await BenchNative.readRange({ offset, length });
		return { data: decodeBase64(data) };
	}
}

export function androidPlatform(): Platform {
	let hasBasemap = false;
	const sqlite = new SQLiteConnection(CapacitorSQLite);
	return {
		name: 'android',
		persistence: async () => {
			const database = await sqlite.createConnection(DB_NAME, false, 'no-encryption', 1, false);
			await database.open();
			// The reopened page probes the lock a dead renderer may have left (#1363).
			const started = performance.now();
			await database.execute('BEGIN IMMEDIATE; ROLLBACK;', false);
			console.info(`lock probe ${Math.round(performance.now() - started)} ms`);
			// Count the plugin calls TanStack's driver makes: each is one bridge round trip.
			for (const method of ['run', 'query', 'execute'] as const) {
				const original = database[method].bind(database) as (...args: unknown[]) => Promise<unknown>;
				(database as unknown as Record<string, unknown>)[method] = async (...args: unknown[]) => {
					const t0 = performance.now();
					try {
						return await original(...args);
					} finally {
						bridgeStats.calls[method]++;
						bridgeStats.ms += performance.now() - t0;
					}
				};
			}
			return createCapacitorSQLitePersistence({ database });
		},
		dbSizeBytes: async () => (await BenchNative.dbSize({ name: `${DB_NAME}SQLite.db` })).bytes,
		wipe: async () => {
			try {
				await sqlite.closeConnection(DB_NAME, false);
			} catch {}
			await BenchNative.deleteDatabase({ name: `${DB_NAME}SQLite.db` });
			await BenchNative.restartApp();
		},
		basemapInfo: async () => {
			const info = await BenchNative.basemapInfo();
			hasBasemap = info.exists;
			return info.exists ? { bytes: info.bytes } : null;
		},
		downloadBasemap: async (url, onProgress) => {
			const handle = await BenchNative.addListener('downloadProgress', (e) => onProgress(e.bytes));
			try {
				const result = await BenchNative.downloadBasemap({ url });
				hasBasemap = true;
				return result;
			} finally {
				await handle.remove();
			}
		},
		basemapSource: () => (hasBasemap ? new NativeRangeSource() : null),
		sinceProcessStartMs: async () => (await BenchNative.sinceProcessStart()).ms,
		appendLog: async (line) => BenchNative.appendLog({ line }),
		readLog: async () => (await BenchNative.readLog()).text,
		shareLog: async (text) => BenchNative.shareText({ text }),
		recovery: async () => {
			const { recovery } = await BenchNative.getRecovery();
			return recovery ? (JSON.parse(recovery) as Recovery) : null;
		},
		clearRecovery: async () => BenchNative.clearRecovery(),
		killRenderer: async (kind, expectedQueueIds) =>
			BenchNative.killRenderer({ kind, expectedQueueIds: JSON.stringify(expectedQueueIds) }),
		canKillRenderer: true,
		sqliteCalls: () => {
			const snapshot = { ...bridgeStats.calls, ms: Math.round(bridgeStats.ms) };
			bridgeStats.calls = { run: 0, query: 0, execute: 0 };
			bridgeStats.ms = 0;
			return snapshot;
		},
	};
}
