import { useLiveQuery } from '@tanstack/react-db';
import { type GeoJSONSource, Map as MapLibreGlMap, type Map as MapLibreMap } from 'maplibre-gl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { firstSync, rewriteRouteItems } from './bench/first-sync';
import { heapMb, nextFrame, round, sleep } from './bench/frames';
import { deviceInfo, type LogEntry, logResult, onLog } from './bench/log';
import { runPan } from './bench/pan';
import { parseGpx, replayTrack } from './bench/track';
import type { Collections, QueueEntry, Row } from './data/collections';
import { featuresFrom, setOverlays } from './map/overlays';
import { basemapStyle } from './map/style';
import type { Platform } from './platform';

type Box = [number, number, number, number];
const FALLBACK_BOX: Box = [-74.64332, 40.24069, -74.19286, 40.61925];
const BASE_URL_KEY = 'bench:baseUrl';
const PAN_MS = 30_000;

function readBaseUrl() {
	try {
		return localStorage.getItem(BASE_URL_KEY) ?? 'http://192.168.1.213:8787';
	} catch {
		return 'http://192.168.1.213:8787';
	}
}

type Stop = { id: string; habitatId: string; n: number; name: string; coord: [number, number] };

export function App({
	platform,
	collections,
	hydratedMs,
}: {
	platform: Platform;
	collections: Collections;
	hydratedMs: number;
}) {
	const mapDiv = useRef<HTMLDivElement>(null);
	const mapRef = useRef<MapLibreMap | null>(null);
	const [mapReady, setMapReady] = useState(false);
	const [baseUrl, setBaseUrl] = useState(readBaseUrl);
	const [status, setStatus] = useState('starting');
	const [busy, setBusy] = useState(false);
	const [panelOpen, setPanelOpen] = useState(false);
	const [results, setResults] = useState<LogEntry[]>([]);
	const [heap, setHeap] = useState<number | null>(heapMb());
	const [rowCounts, setRowCounts] = useState(() => counts(collections));
	const [dataVersion, setDataVersion] = useState(0);
	const [basemapLabel, setBasemapLabel] = useState('');
	const [tapTimes, setTapTimes] = useState<number[]>([]);
	const pendingTaps = useRef<{ start: number; persisted: Promise<number> }[]>([]);

	useEffect(() => onLog((entry) => setResults((r) => [entry, ...r].slice(0, 40))), []);
	useEffect(() => {
		const id = setInterval(() => setHeap(heapMb()), 2000);
		return () => clearInterval(id);
	}, []);

	const box = useMemo<Box>(() => {
		const regions = collections.synced.regions.toArray as Row[];
		if (!regions.length) return FALLBACK_BOX;
		let [w, s, e, n] = [180, 90, -180, -90];
		for (const r of regions) {
			const g = r.geojson as { coordinates: number[][][] } | null;
			for (const ring of g?.coordinates ?? [])
				for (const [x, y] of ring) {
					w = Math.min(w, x);
					e = Math.max(e, x);
					s = Math.min(s, y);
					n = Math.max(n, y);
				}
		}
		return [w, s, e, n];
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [collections, dataVersion]);

	const overlayData = useCallback(
		() => ({
			habitats: featuresFrom(collections.synced.habitats.toArray as Row[]),
			addresses: featuresFrom(collections.synced.addresses.toArray as Row[]),
			traps: featuresFrom(collections.synced.traps.toArray as Row[]),
			regions: featuresFrom(collections.synced.regions.toArray as Row[]),
		}),
		[collections],
	);

	// The map, created once. Cold start is timed to the first idle with every overlay set.
	useEffect(() => {
		let cancelled = false;
		(async () => {
			const info = await platform.basemapInfo().catch(() => null);
			const local = platform.basemapSource();
			setBasemapLabel(
				local ? `local file, ${round((info?.bytes ?? 0) / 1e6)} MB` : `remote, ${baseUrl}/basemap.pmtiles`,
			);
			if (cancelled || !mapDiv.current) return;
			const map = new MapLibreGlMap({
				container: mapDiv.current,
				style: basemapStyle(local, `${baseUrl}/basemap.pmtiles`),
				bounds: box,
				fitBoundsOptions: { padding: 20 },
				maxZoom: 19,
				attributionControl: { compact: true },
				fadeDuration: 0,
			});
			mapRef.current = map;
			map.on('click', 'habitats-points', (e) => {
				const id = e.features?.[0]?.properties?.id;
				if (id) setStatus(`tapped habitat ${String(id).slice(0, 8)}`);
			});
			map.on('click', 'route-pins', (e) => {
				const n = e.features?.[0]?.properties?.n;
				setStatus(`tapped stop ${n}`);
			});
			map.on('load', () => {
				setOverlays(map, overlayData(), { clustered: true, regionsVisible: true });
				map.once('idle', async () => {
					setMapReady(true);
					const sinceProcessStartMs = await platform.sinceProcessStartMs();
					const hadData = (collections.synced.habitats.size ?? 0) > 0;
					await logResult(platform, {
						type: 'cold-start',
						hadData,
						sinceProcessStartMs: sinceProcessStartMs === null ? null : Math.round(sinceProcessStartMs),
						pageMs: Math.round(performance.now()),
						hydratedMs: Math.round(hydratedMs),
						rows: counts(collections),
						basemap: local ? 'local' : 'remote',
						heapMb: heapMb(),
						device: deviceInfo(),
					});
					setStatus(hadData ? 'ready' : 'no data yet: open Bench and run First sync');
					await checkRecovery(platform, collections);
				});
			});
		})();
		return () => {
			cancelled = true;
		};
		// The map is created once per page; later changes go through its own API.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// The run: the route with the most habitat stops, in position order.
	const stops = useMemo<Stop[]>(() => {
		const items = collections.synced.route_items.toArray as Row[];
		const habitats = new Map((collections.synced.habitats.toArray as Row[]).map((h) => [h.id, h]));
		const byRoute = new Map<string, Row[]>();
		for (const item of items) {
			if (!habitats.has(item.entity_id as string)) continue;
			const list = byRoute.get(item.route_id as string) ?? [];
			list.push(item);
			byRoute.set(item.route_id as string, list);
		}
		const longest = [...byRoute.values()].sort((a, b) => b.length - a.length)[0] ?? [];
		return longest
			.sort((a, b) => (a.position as number) - (b.position as number))
			.map((item, i) => {
				const h = habitats.get(item.entity_id as string) as Row;
				const g = h.geojson as { coordinates: [number, number] };
				return {
					id: item.id,
					habitatId: h.id,
					n: i + 1,
					name: (h.habitat_name as string) ?? 'Habitat',
					coord: g.coordinates,
				};
			});
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [collections, dataVersion]);

	const { data: queueEntries } = useLiveQuery((q) => q.from({ queue: collections.queue }));
	const visited = useMemo(
		() => new Set((queueEntries ?? []).map((e: QueueEntry) => e.entity_id)),
		[queueEntries],
	);
	const currentIndex = stops.findIndex((s) => !visited.has(s.habitatId));
	const current = currentIndex >= 0 ? stops[currentIndex] : null;

	// Pins redraw from the queue's live query, as the field app's unsent marks do.
	useEffect(() => {
		const map = mapRef.current;
		if (!map || !mapReady) return;
		const source = map.getSource('route') as GeoJSONSource | undefined;
		if (!source) return;
		source.setData({
			type: 'FeatureCollection',
			features: stops.map((s) => ({
				type: 'Feature',
				geometry: { type: 'Point', coordinates: s.coord },
				properties: { n: s.n, visited: visited.has(s.habitatId), current: s.id === current?.id },
			})),
		});
		// Every tap whose save this render reflects is timed to the frame that paints it.
		const taps = pendingTaps.current.splice(0);
		if (!taps.length) return;
		const onData = (e: { sourceId?: string; sourceDataType?: string }) => {
			if (e.sourceId !== 'route' || e.sourceDataType === 'metadata' || !map.isSourceLoaded('route')) return;
			map.off('sourcedata', onData);
			map.once('render', () =>
				requestAnimationFrame(async () => {
					const painted = performance.now();
					for (const tap of taps) {
						const ms = painted - tap.start;
						setTapTimes((t) => [...t, ms]);
						const persistedAt = await tap.persisted;
						await logResult(platform, {
							type: 'tap',
							paintedMs: round(ms),
							persistedMs: round(persistedAt - tap.start),
							stops: stops.length,
							queued: visited.size,
						});
					}
				}),
			);
			map.triggerRepaint();
		};
		map.on('sourcedata', onData);
	}, [stops, visited, current, mapReady, platform]);

	const saveResult = (event: React.MouseEvent) => {
		if (!current) return;
		const start = event.timeStamp;
		const entry: QueueEntry = {
			id: crypto.randomUUID(),
			created_at: Date.now(),
			table: 'inspections',
			intents: ['larvalSurveillance.recordInspection'],
			entity_id: current.habitatId,
			status: 'queued',
			body: { habitat_id: current.habitatId, result: 'no_breeding', inspected_at: new Date().toISOString() },
		};
		const tx = collections.queue.insert(entry);
		pendingTaps.current.push({ start, persisted: tx.isPersisted.promise.then(() => performance.now()) });
	};

	const undo = () => {
		const last = [...(queueEntries ?? [])].sort((a, b) => b.created_at - a.created_at)[0];
		if (last) collections.queue.delete(last.id);
	};

	const run = async (label: string, work: () => Promise<void>) => {
		if (busy) return;
		setBusy(true);
		setPanelOpen(false);
		setStatus(label);
		try {
			await work();
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			setStatus(`${label} failed: ${message}`);
			await logResult(platform, { type: 'error', label, message });
		} finally {
			setBusy(false);
		}
	};

	const saveBaseUrl = (value: string) => {
		setBaseUrl(value);
		try {
			localStorage.setItem(BASE_URL_KEY, value);
		} catch {}
	};

	const doFirstSync = () =>
		run('first sync', async () => {
			if (collections.filler('habitats')?.synced()) {
				setStatus('already synced: Wipe database first');
				return;
			}
			platform.sqliteCalls?.();
			const result = await firstSync(collections, baseUrl, setStatus);
			await sleep(500);
			const dbBytes = await platform.dbSizeBytes();
			setRowCounts(counts(collections));
			setDataVersion((v) => v + 1);
			const map = mapRef.current;
			if (map) setOverlays(map, overlayData(), { clustered: true, regionsVisible: true });
			await logResult(platform, {
				type: 'first-sync',
				...result,
				dbMb: dbBytes === null ? null : round(dbBytes / 1e6),
				sqliteCalls: platform.sqliteCalls?.() ?? null,
				heapMb: heapMb(),
				device: deviceInfo(),
			});
			setStatus(`first sync ${round(result.totalMs / 1000)} s, db ${dbBytes === null ? '?' : round(dbBytes / 1e6)} MB`);
		});

	const doBasemap = () =>
		run('basemap download', async () => {
			const t0 = performance.now();
			const result = await platform.downloadBasemap(`${baseUrl}/basemap.pmtiles`, (bytes) =>
				setStatus(`basemap ${round(bytes / 1e6)} MB`),
			);
			await logResult(platform, {
				type: 'basemap-download',
				mb: round(result.bytes / 1e6),
				ms: Math.round(performance.now() - t0),
			});
			setStatus('basemap downloaded; reloading');
			await sleep(800);
			location.reload();
		});

	const doPan = (clustered: boolean) =>
		run(clustered ? 'pan run' : 'pan run, unclustered', async () => {
			const map = mapRef.current;
			if (!map) return;
			setOverlays(map, overlayData(), { clustered, regionsVisible: true });
			const stats = await runPan(map, box, PAN_MS, (f) => setStatus(`pan ${Math.round(f * 100)}%`));
			if (!clustered) setOverlays(map, overlayData(), { clustered: true, regionsVisible: true });
			await logResult(platform, {
				type: clustered ? 'pan' : 'pan-unclustered',
				...stats,
				features: rowCounts.habitats + rowCounts.addresses,
				basemap: platform.basemapSource() ? 'local' : 'remote',
				heapMb: heapMb(),
			});
			setStatus(`pan: median ${stats.medianFps} fps, worst ${stats.maxMs} ms`);
		});

	const doSweep = () =>
		run('unclustered sweep', async () => {
			const map = mapRef.current;
			if (!map) return;
			const base = overlayData();
			const points = [...base.habitats.features, ...base.addresses.features];
			const empty = { type: 'FeatureCollection' as const, features: [] };
			const steps: unknown[] = [];
			for (const target of [10_000, 25_000, 50_000, 75_000, 100_000, 150_000]) {
				const features = [];
				for (let i = 0; i < target; i++) {
					const f = points[i % points.length];
					const round_ = Math.floor(i / points.length);
					const [x, y] = (f.geometry as { coordinates: [number, number] }).coordinates;
					const jitter = round_ ? 0.002 * round_ : 0;
					features.push({
						...f,
						geometry: { type: 'Point' as const, coordinates: [x + jitter, y - jitter] },
						properties: { id: `${i}` },
					});
				}
				setOverlays(
					map,
					{ ...base, habitats: { type: 'FeatureCollection', features }, addresses: empty },
					{ clustered: false, regionsVisible: true },
				);
				const stats = await runPan(map, box, 12_000, (f) => setStatus(`sweep ${target}: ${Math.round(f * 100)}%`));
				steps.push({ features: target, ...stats });
				if (stats.medianFps < 20) break;
			}
			setOverlays(map, base, { clustered: true, regionsVisible: true });
			await logResult(platform, { type: 'unclustered-sweep', steps });
			setStatus('sweep done');
		});

	const doHeap = () =>
		run('heap', async () => {
			await logResult(platform, {
				type: 'heap',
				heapMb: heapMb(),
				rows: counts(collections),
				note: 'performance.memory is the main thread only; record the DevTools heap snapshot total beside it',
			});
			setStatus(`heap ${heapMb()} MB (record the DevTools snapshot too)`);
		});

	const doTapSummary = () =>
		run('tap summary', async () => {
			const sorted = [...tapTimes].sort((a, b) => a - b);
			await logResult(platform, {
				type: 'tap-summary',
				taps: sorted.length,
				medianMs: round(sorted[Math.floor(sorted.length / 2)] ?? 0),
				maxMs: round(sorted.at(-1) ?? 0),
			});
			setTapTimes([]);
		});

	const doTrack = (file: File) =>
		run('track replay', async () => {
			const map = mapRef.current;
			if (!map) return;
			const fixes = parseGpx(await file.text());
			if (fixes.length < 2) throw new Error('no track points in that file');
			const result = await replayTrack(map, fixes, 60, 1000, (f) => setStatus(`track ${Math.round(f * 100)}%`));
			await logResult(platform, { type: 'track', file: file.name, ...result });
			setStatus(`track: ${result.vertices} vertices, worst frame ${result.maxMs} ms`);
		});

	const doKill = (kind: 'crash' | 'kill', midWrite: boolean) =>
		run(`renderer ${kind}`, async () => {
			const persisted: string[] = (collections.queue.toArray as QueueEntry[]).map((e) => e.id);
			if (midWrite) {
				// A sync rewrite and a burst of saves in flight when the renderer dies (#1363).
				rewriteRouteItems(collections);
				(async () => {
					for (let i = 0; i < 200; i++) {
						const entry: QueueEntry = {
							id: crypto.randomUUID(),
							created_at: Date.now(),
							table: 'comments',
							intents: ['comments.create'],
							entity_id: `burst-${i}`,
							status: 'queued',
							body: { i },
						};
						const tx = collections.queue.insert(entry);
						await tx.isPersisted.promise;
						persisted.push(entry.id);
					}
				})();
				await sleep(400);
			}
			await logResult(platform, { type: 'renderer-kill-asked', kind, midWrite, expectedQueued: persisted.length });
			await platform.killRenderer(kind, [...persisted]);
		});

	const doShare = () =>
		run('share results', async () => {
			await platform.shareLog(await platform.readLog());
			setStatus('results shared');
		});

	const doWipe = () => run('wipe', () => platform.wipe());

	return (
		<div className="app">
			<div ref={mapDiv} className="map" />
			<div className="hud">
				<div>
					{platform.name} · heap {heap ?? '?'} MB · habitats {rowCounts.habitats} · addresses{' '}
					{rowCounts.addresses} · items {rowCounts.route_items} · queue {queueEntries?.length ?? 0}
				</div>
				<div>{status}</div>
			</div>
			{current ? (
				<div className="stop-card">
					<div className="stop-title">
						Stop {current.n} of {stops.length} · {current.name}
					</div>
					<div className="stop-actions">
						<button type="button" className="primary" onClick={saveResult}>
							No breeding
						</button>
						<button type="button" onClick={undo}>
							Undo
						</button>
					</div>
					{tapTimes.length ? (
						<div className="stop-meta">
							{tapTimes.length} taps · last {round(tapTimes.at(-1) ?? 0)} ms
						</div>
					) : null}
				</div>
			) : null}
			<button type="button" className="bench-toggle" onClick={() => setPanelOpen((o) => !o)} disabled={busy}>
				{busy ? 'Running' : 'Bench'}
			</button>
			{panelOpen ? (
				<div className="panel">
					<label className="field">
						LAN server
						<input value={baseUrl} onChange={(e) => saveBaseUrl(e.target.value)} inputMode="url" />
					</label>
					<div className="note">Basemap: {basemapLabel}</div>
					<div className="buttons">
						<button type="button" onClick={doFirstSync}>
							1. First sync
						</button>
						<button type="button" onClick={doBasemap} disabled={platform.name === 'browser'}>
							2. Download basemap
						</button>
						<button type="button" onClick={doHeap}>
							3. Record heap
						</button>
						<button type="button" onClick={() => doPan(true)}>
							4. Pan run (graded)
						</button>
						<button type="button" onClick={() => doPan(false)}>
							5. Pan run, unclustered
						</button>
						<button type="button" onClick={doSweep}>
							6. Unclustered sweep
						</button>
						<button type="button" onClick={doTapSummary}>
							7. Log tap summary
						</button>
						<label className="file-button">
							8. Replay GPX
							<input
								type="file"
								accept=".gpx,application/gpx+xml,application/xml,text/xml"
								onChange={(e) => {
									const file = e.target.files?.[0];
									if (file) doTrack(file);
									e.target.value = '';
								}}
							/>
						</label>
						{platform.canKillRenderer ? (
							<>
								<button type="button" onClick={() => doKill('crash', false)}>
									9. Kill renderer (crash)
								</button>
								<button type="button" onClick={() => doKill('kill', false)}>
									10. Kill renderer (kill)
								</button>
								<button type="button" onClick={() => doKill('crash', true)}>
									11. Kill mid-write
								</button>
							</>
						) : null}
						<button type="button" onClick={doShare}>
							Share results
						</button>
						<button type="button" className="danger" onClick={doWipe}>
							Wipe database
						</button>
					</div>
					<ol className="results">
						{results.map((r, i) => (
							<li key={`${r.at}-${i}`}>
								<code>{JSON.stringify(r).slice(0, 400)}</code>
							</li>
						))}
					</ol>
				</div>
			) : null}
		</div>
	);
}

function counts(collections: Collections) {
	return {
		habitats: collections.synced.habitats.size,
		addresses: collections.synced.addresses.size,
		traps: collections.synced.traps.size,
		regions: collections.synced.regions.size,
		route_items: collections.synced.route_items.size,
		queue: collections.queue.size,
	};
}

/** After a renderer death: how long the map took to come back, and whether every saved command survived. */
async function checkRecovery(platform: Platform, collections: Collections) {
	const recovery = await platform.recovery();
	if (!recovery) return;
	await platform.clearRecovery();
	const recoveredMs = Date.now() - recovery.goneAt;
	const present = new Set((collections.queue.toArray as QueueEntry[]).map((e) => e.id));
	const missing = recovery.expectedQueueIds.filter((id) => !present.has(id));
	// One save after recovery, to show the file is writable (no lock left behind).
	const t0 = performance.now();
	let saveAfterMs: number | null = null;
	let saveError: string | null = null;
	try {
		const tx = collections.queue.insert({
			id: crypto.randomUUID(),
			created_at: Date.now(),
			table: 'comments',
			intents: ['comments.create'],
			entity_id: 'after-recovery',
			status: 'queued',
			body: {},
		});
		await Promise.race([
			tx.isPersisted.promise,
			sleep(10_000).then(() => {
				throw new Error('save did not persist within 10 s');
			}),
		]);
		saveAfterMs = Math.round(performance.now() - t0);
	} catch (error) {
		saveError = error instanceof Error ? error.message : String(error);
	}
	await nextFrame();
	await logResult(platform, {
		type: 'renderer-recovered',
		kind: recovery.kind,
		didCrash: recovery.didCrash,
		rendererPriorityAtExit: recovery.rendererPriorityAtExit ?? null,
		recoveredMs,
		expectedQueued: recovery.expectedQueueIds.length,
		missing: missing.length,
		missingIds: missing.slice(0, 10),
		saveAfterMs,
		saveError,
		pass: recoveredMs <= 10_000 && missing.length === 0 && saveError === null,
	});
}
