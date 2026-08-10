import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { brand, green, yellow } from '../../colors.js';

/**
 * Guards the hex mirror in `colors.ts` against the OKLCH source in
 * `tokens.css`.
 *
 * These two representations of the same scales drifted on 16 of 20 steps before
 * this test existed. The failure mode is quiet by construction: CSS consumers
 * read the OKLCH and look correct, JS consumers read the hex and look correct,
 * and nothing compares them. The only place the difference surfaces is the
 * design-token showcase in `apps/preview`, which is exactly where someone goes
 * to look a colour up — so the wrong value is the one that gets copied.
 *
 * The test derives hex from the stylesheet rather than restating it, so there
 * is no third copy to drift.
 */

const TOKENS_CSS = fileURLToPath(new URL('../../tokens.css', import.meta.url));

/** OKLCH -> sRGB, matching what a browser renders (out-of-gamut is clipped). */
function oklchToHex(L: number, C: number, hDeg: number): string {
	const h = (hDeg * Math.PI) / 180;
	const a = C * Math.cos(h);
	const b = C * Math.sin(h);
	const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
	const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
	const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
	const linear = [
		4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
		-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
		-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
	];
	const channels = linear.map((v) => {
		const encoded = v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
		return Math.min(255, Math.max(0, Math.round(encoded * 255)));
	});
	return `#${channels.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/** `--simmer-green-400: oklch(64.6% 0.112 157);` -> `{ 'green-400': '#4ba272' }` */
function hexFromStylesheet(): ReadonlyMap<string, string> {
	const css = readFileSync(TOKENS_CSS, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
	const declaration =
		/--simmer-(green|yellow)-(\d{2,3})\s*:\s*oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)\s*\)/g;
	const out = new Map<string, string>();
	let match = declaration.exec(css);
	while (match !== null) {
		const [, family, step, rawL, percent, chroma, hue] = match;
		const lightness = Number(rawL);
		out.set(
			`${family}-${step}`,
			oklchToHex(percent === '%' ? lightness / 100 : lightness, Number(chroma), Number(hue)),
		);
		match = declaration.exec(css);
	}
	return out;
}

const FROM_CSS = hexFromStylesheet();

describe('brand scale hex mirrors tokens.css', () => {
	it('finds every scale step in the stylesheet', () => {
		// 10 steps x 2 families. A miss here means the regex drifted, not the colours.
		expect(FROM_CSS.size).toBe(20);
	});

	it.each(Object.keys(green))('green-%s matches its OKLCH source', (step) => {
		expect(green[Number(step) as keyof typeof green]).toBe(FROM_CSS.get(`green-${step}`));
	});

	it.each(Object.keys(yellow))('yellow-%s matches its OKLCH source', (step) => {
		expect(yellow[Number(step) as keyof typeof yellow]).toBe(FROM_CSS.get(`yellow-${step}`));
	});

	it('keeps the named brand constants pinned to their scale steps', () => {
		expect(brand.green).toBe(green[600]);
		expect(brand.darkGreen).toBe(green[700]);
		expect(brand.darkerGreen).toBe(green[800]);
		expect(brand.yellow).toBe(yellow[100]);
	});

	it('matches the standalone brand hues to their tokens.css values', () => {
		// These are declared directly rather than as scale steps.
		const standalone: readonly (readonly [string, string])[] = [
			[brand.purple, oklchToHex(0.4937, 0.1424, 325.97)],
			[brand.red, oklchToHex(0.6156, 0.2307, 16.37)],
			[brand.blue, oklchToHex(0.4483, 0.1791, 268.37)],
		];
		for (const [declared, derived] of standalone) {
			expect(declared).toBe(derived);
		}
	});
});
