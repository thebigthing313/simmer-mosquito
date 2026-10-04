/** Records the gap between animation frames until stopped. */
export function recordFrames() {
	const deltas: number[] = [];
	let last = 0;
	let running = true;
	const tick = (t: number) => {
		if (!running) return;
		if (last) deltas.push(t - last);
		last = t;
		requestAnimationFrame(tick);
	};
	requestAnimationFrame(tick);
	return {
		stop: () => {
			running = false;
			return deltas;
		},
	};
}

export type FrameStats = {
	frames: number;
	medianFps: number;
	medianMs: number;
	p95Ms: number;
	maxMs: number;
	over50: number;
	over100: number;
	over200: number;
};

export function frameStats(deltas: number[]): FrameStats {
	const sorted = [...deltas].sort((a, b) => a - b);
	const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0;
	const median = at(0.5);
	return {
		frames: deltas.length,
		medianMs: round(median),
		medianFps: round(median ? 1000 / median : 0),
		p95Ms: round(at(0.95)),
		maxMs: round(sorted.at(-1) ?? 0),
		over50: deltas.filter((d) => d > 50).length,
		over100: deltas.filter((d) => d > 100).length,
		over200: deltas.filter((d) => d > 200).length,
	};
}

export function median(values: number[]) {
	const sorted = [...values].sort((a, b) => a - b);
	return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

export function round(n: number, digits = 1) {
	const f = 10 ** digits;
	return Math.round(n * f) / f;
}

export const nextFrame = () => new Promise<number>((r) => requestAnimationFrame(r));
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function heapMb(): number | null {
	const memory = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
	return memory ? round(memory.usedJSHeapSize / 1e6) : null;
}
