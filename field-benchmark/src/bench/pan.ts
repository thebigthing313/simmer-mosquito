import type { Map as MapLibreMap } from 'maplibre-gl';
import { type FrameStats, frameStats, nextFrame } from './frames';

type Key = { t: number; x: number; y: number; z: number };

/**
 * The scripted camera: fractions of the Organization box and zooms, the same
 * path on every device. It opens on the whole county, dives to street level in
 * two places, pans between them at zoom 15.5 so tiles load mid-motion, and
 * returns to the county.
 */
const PATH: Key[] = [
	{ t: 0, x: 0.5, y: 0.5, z: -1 },
	{ t: 0.2, x: 0.32, y: 0.42, z: 13 },
	{ t: 0.33, x: 0.32, y: 0.42, z: 15.5 },
	{ t: 0.5, x: 0.62, y: 0.58, z: 15.5 },
	{ t: 0.63, x: 0.5, y: 0.5, z: 12 },
	{ t: 0.8, x: 0.45, y: 0.25, z: 15 },
	{ t: 1, x: 0.5, y: 0.5, z: -1 },
];

export async function runPan(
	map: MapLibreMap,
	box: [number, number, number, number],
	durationMs: number,
	onProgress?: (fraction: number) => void,
): Promise<FrameStats & { durationMs: number }> {
	const [w, s, e, n] = box;
	const fit = map.cameraForBounds([w, s, e, n], { padding: 20 })?.zoom ?? 10;
	const lerp = (a: number, b: number, f: number) => a + (b - a) * f;
	const at = (f: number) => {
		let i = 0;
		while (i < PATH.length - 2 && PATH[i + 1].t < f) i++;
		const a = PATH[i];
		const b = PATH[i + 1];
		const local = Math.min(1, Math.max(0, (f - a.t) / (b.t - a.t)));
		const za = a.z < 0 ? fit : a.z;
		const zb = b.z < 0 ? fit : b.z;
		return {
			center: [lerp(w, e, lerp(a.x, b.x, local)), lerp(n, s, lerp(a.y, b.y, local))] as [number, number],
			zoom: lerp(za, zb, local),
		};
	};

	map.jumpTo(at(0));
	await new Promise<void>((resolve) => map.once('idle', () => resolve()));

	const deltas: number[] = [];
	const started = await nextFrame();
	let last = started;
	for (;;) {
		const now = await nextFrame();
		deltas.push(now - last);
		last = now;
		const f = (now - started) / durationMs;
		if (f >= 1) break;
		map.jumpTo(at(f));
		onProgress?.(f);
	}
	return { ...frameStats(deltas), durationMs };
}
