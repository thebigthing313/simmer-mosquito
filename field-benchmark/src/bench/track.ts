import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl';
import simplify from 'simplify-js';
import { frameStats, nextFrame } from './frames';

export type Fix = { lng: number; lat: number; time: number; accuracy: number | null };

/** Reads every track point of a GPX file, in order. */
export function parseGpx(text: string): Fix[] {
	const doc = new DOMParser().parseFromString(text, 'application/xml');
	const points = Array.from(doc.getElementsByTagName('trkpt'));
	return points.map((p, i) => {
		const time = p.getElementsByTagName('time')[0]?.textContent;
		const hdop = p.getElementsByTagName('hdop')[0]?.textContent;
		const accuracy = p.getElementsByTagName('accuracy')[0]?.textContent;
		return {
			lng: Number(p.getAttribute('lon')),
			lat: Number(p.getAttribute('lat')),
			time: time ? Date.parse(time) : i * 1000,
			accuracy: accuracy ? Number(accuracy) : hdop ? Number(hdop) * 5 : null,
		};
	});
}

/** The filter and simplification the benchmark grades. Recorded with every run. */
export const TRACK_RULES = {
	dropAccuracyOverM: 25,
	minStepM: 5,
	simplifyToleranceM: 3,
};

const R = 6378137;
const toMeters = (f: Fix) => ({
	x: (R * f.lng * Math.PI) / 180,
	y: R * Math.log(Math.tan(Math.PI / 4 + (f.lat * Math.PI) / 360)),
});

/** Mercator metres are stretched by 1/cos(lat); scale the tolerances to match. */
function filterFixes(fixes: Fix[]) {
	const kept: Fix[] = [];
	for (const fix of fixes) {
		if (fix.accuracy !== null && fix.accuracy > TRACK_RULES.dropAccuracyOverM) continue;
		const prev = kept.at(-1);
		if (prev) {
			const scale = 1 / Math.cos((fix.lat * Math.PI) / 180);
			const a = toMeters(prev);
			const b = toMeters(fix);
			if (Math.hypot(a.x - b.x, a.y - b.y) < TRACK_RULES.minStepM * scale) continue;
		}
		kept.push(fix);
	}
	return kept;
}

function simplifyFixes(fixes: Fix[]) {
	if (fixes.length < 3) return fixes;
	const scale = 1 / Math.cos((fixes[0].lat * Math.PI) / 180);
	const projected = fixes.map((f, i) => ({ ...toMeters(f), i }));
	const kept = simplify(projected, TRACK_RULES.simplifyToleranceM * scale, true) as typeof projected;
	return kept.map((p) => fixes[p.i]);
}

/**
 * Replays a recorded drive through a mock fix stream at `speed` times real time,
 * redrawing the Track layer every `redrawMs` of wall time from the filtered and
 * simplified line, and records frame times for the whole replay.
 */
export async function replayTrack(
	map: MapLibreMap,
	fixes: Fix[],
	speed: number,
	redrawMs: number,
	onProgress?: (fraction: number) => void,
) {
	const source = map.getSource('track') as GeoJSONSource;
	const startedTrack = fixes[0]?.time ?? 0;
	const span = (fixes.at(-1)?.time ?? 0) - startedTrack;
	const received: Fix[] = [];
	const deltas: number[] = [];
	const redrawCosts: number[] = [];
	let next = 0;
	let lastRedraw = 0;
	let simplified: Fix[] = [];
	const started = await nextFrame();
	let last = started;
	for (;;) {
		const now = await nextFrame();
		deltas.push(now - last);
		last = now;
		const trackTime = startedTrack + (now - started) * speed;
		while (next < fixes.length && fixes[next].time <= trackTime) received.push(fixes[next++]);
		const done = next >= fixes.length;
		if (now - lastRedraw >= redrawMs || done) {
			lastRedraw = now;
			const t0 = performance.now();
			simplified = simplifyFixes(filterFixes(received));
			source.setData({
				type: 'Feature',
				properties: {},
				geometry: { type: 'LineString', coordinates: simplified.map((f) => [f.lng, f.lat]) },
			});
			redrawCosts.push(performance.now() - t0);
		}
		onProgress?.(span ? (trackTime - startedTrack) / span : 1);
		if (done) break;
	}
	await new Promise<void>((resolve) => map.once('idle', () => resolve()));
	const filtered = filterFixes(fixes);
	return {
		rules: TRACK_RULES,
		speed,
		redrawMs,
		trackMinutes: Math.round(span / 60000),
		rawFixes: fixes.length,
		filteredFixes: filtered.length,
		vertices: simplified.length,
		maxMainThreadRedrawMs: Math.round(Math.max(0, ...redrawCosts)),
		...frameStats(deltas),
	};
}
