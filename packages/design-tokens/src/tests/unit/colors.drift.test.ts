import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { formatHex, oklchToRgb } from '../../color.js';
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

/**
 * `--simmer-green-400: oklch(64.6% 0.112 157);` -> `{ 'green-400': '#4ba272' }`,
 * and `--simmer-purple: oklch(0.4937 0.1424 325.97);` -> `{ purple: '#893f8c' }`.
 *
 * The step is optional because the three standalone hues are declared without
 * one. The `oklch(` right after the colon is what keeps the four `var()`
 * aliases out. The `color-mix()` arguments are out for a different reason. A
 * token named inside a mix is not followed by a colon at all.
 */
function hexFromStylesheet(): ReadonlyMap<string, string> {
	const css = readFileSync(TOKENS_CSS, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
	const declaration =
		/--simmer-(green|yellow|purple|red|blue)(-\d{2,3})?\s*:\s*oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)\s*\)/g;
	const out = new Map<string, string>();
	let match = declaration.exec(css);
	while (match !== null) {
		const [, family, step, rawL, percent, chroma, hue] = match;
		const lightness = Number(rawL);
		out.set(
			`${family}${step ?? ''}`,
			formatHex(
				oklchToRgb({
					lightness: percent === '%' ? lightness / 100 : lightness,
					chroma: Number(chroma),
					hue: Number(hue),
				}),
			),
		);
		match = declaration.exec(css);
	}
	return out;
}

const FROM_CSS = hexFromStylesheet();

describe('brand scale hex mirrors tokens.css', () => {
	it('finds every scale step in the stylesheet', () => {
		// 10 steps x 2 families, plus the 3 standalone hues. A miss here means the
		// regex drifted, not the colours. A family it stops matching would leave the
		// comparison with nothing else saying so.
		expect(FROM_CSS.size).toBe(23);
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

	// The three standalone hues are declared directly rather than as scale steps,
	// so `FROM_CSS` keys them by name alone. A case each, so a run says which of
	// the three drifted rather than stopping at the first.
	it.each([
		['purple', brand.purple],
		['red', brand.red],
		['blue', brand.blue],
	])('%s matches its OKLCH source', (name, declared) => {
		expect(declared).toBe(FROM_CSS.get(name));
	});
});
