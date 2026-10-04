import { type Collections, type Row, SYNCED_TABLES, type SyncedTable } from '../data/collections';

export type TableTiming = {
	rows: number;
	downloadMs: number;
	writeMs: number;
	wireBytes: number | null;
};

/**
 * The first sync: every eager table fetched in parallel from the LAN server and
 * written into its persisted collection in pages, the way shapes stream in.
 * The wire is the gzip JSON bundle rather than Electric's shape log, which
 * carries a header per row, so the download half is an underestimate; the
 * write half is the real persistence path.
 */
export async function firstSync(
	collections: Collections,
	baseUrl: string,
	onStatus: (text: string) => void,
) {
	const started = performance.now();
	const perTable = {} as Record<SyncedTable, TableTiming>;
	let writeChain = Promise.resolve();
	await Promise.all(
		SYNCED_TABLES.map(async (table) => {
			const filler = collections.filler(table);
			if (!filler) throw new Error(`${table} has not started syncing`);
			const t0 = performance.now();
			const response = await fetch(`${baseUrl}/bundle/${table}.json`, { cache: 'no-store' });
			if (!response.ok) throw new Error(`${table}: HTTP ${response.status}`);
			const wire = response.headers.get('content-length');
			const rows = (await response.json()) as Row[];
			const downloadMs = performance.now() - t0;
			onStatus(`${table}: downloaded ${rows.length} rows`);
			// One writer at a time, as one SQLite connection serialises them anyway.
			const writeDone = writeChain.then(async () => {
				const w0 = performance.now();
				await filler.fill(rows, (n) => onStatus(`${table}: wrote ${n} of ${rows.length}`));
				perTable[table] = {
					rows: rows.length,
					downloadMs: Math.round(downloadMs),
					writeMs: Math.round(performance.now() - w0),
					wireBytes: wire ? Number(wire) : null,
				};
			});
			writeChain = writeDone;
			await writeDone;
		}),
	);
	return { totalMs: Math.round(performance.now() - started), perTable };
}

export async function rewriteRouteItems(collections: Collections) {
	const filler = collections.filler('route_items');
	const rows = collections.synced.route_items.toArray as Row[];
	await filler?.rewrite(rows.map((row) => ({ ...row, updated_at: new Date().toISOString() })));
}
