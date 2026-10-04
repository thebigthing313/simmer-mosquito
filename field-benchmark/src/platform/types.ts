import type { Source } from 'pmtiles';

export type PlatformName = 'android' | 'electron' | 'browser';

export type Recovery = {
	goneAt: number;
	didCrash: boolean;
	rendererPriorityAtExit?: number;
	/** Queue ids whose save had resolved when the kill was asked for. */
	expectedQueueIds: string[];
	kind: string;
};

export interface Platform {
	name: PlatformName;
	/** TanStack persistence for the one database file, or null for in-memory. */
	persistence(): Promise<unknown | null>;
	/** Bytes the database file and its WAL take on disk. */
	dbSizeBytes(): Promise<number | null>;
	/** Deletes the database and restarts the page or app. */
	wipe(): Promise<void>;
	basemapInfo(): Promise<{ bytes: number } | null>;
	downloadBasemap(url: string, onProgress: (bytes: number) => void): Promise<{ bytes: number }>;
	/** The shell's range-read Source over the local basemap file. */
	basemapSource(): Source | null;
	/** Milliseconds since the OS started this process. */
	sinceProcessStartMs(): Promise<number | null>;
	appendLog(line: string): Promise<void>;
	readLog(): Promise<string>;
	shareLog(text: string): Promise<void>;
	recovery(): Promise<Recovery | null>;
	clearRecovery(): Promise<void>;
	killRenderer(kind: 'crash' | 'kill', expectedQueueIds: string[]): Promise<void>;
	canKillRenderer: boolean;
	/** Plugin calls since the last read, where the shell counts them (Android). */
	sqliteCalls?: () => Record<string, number>;
}
