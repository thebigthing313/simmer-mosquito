import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
	contrastRatio,
	type OklchColor,
	oklchToRgb,
	type RgbColor,
	rgbToOklch,
} from '@simmer-mosquito/design-tokens/color';
import { describe, expect, it } from 'vitest';

/**
 * Contrast guard for the semantic token set.
 *
 * This exists because of how the two contrast bugs it now covers actually got
 * shipped: neither was in a base colour. Body copy, headings, and surfaces were
 * always comfortable. What failed were the colours that only appear under a
 * *condition* — focus, error, invalid, inactive — which are exactly the states
 * you have to trigger to look at, and therefore the ones visual review skips.
 * The focus ring sat at 1.24:1 and every form error at 4.07:1 for as long as
 * nobody tabbed into a field and squinted.
 *
 * So the assertions below are deliberately weighted toward state colours rather
 * than the obvious pairs. They read the real stylesheets and resolve the real
 * `var()` and `color-mix()` chains, so editing a token is what moves them —
 * there is no duplicated copy of the palette here to drift out of sync.
 *
 * The colour maths comes from `@simmer-mosquito/design-tokens/color`, which
 * means `packages/design-tokens` has to be built before this suite runs, the
 * same way `apps/server`'s integration suites need `packages/db` built. What
 * stays here is the resolution walker below: this file has no browser, so
 * `var()` and `color-mix()` are chains it has to follow itself. The design-token
 * screen in `apps/preview` does have a browser and reads the resolved value out
 * of it, and that split is deliberate.
 */

const TOKENS_CSS = fileURLToPath(
	new URL('../../../../design-tokens/src/tokens.css', import.meta.url),
);
const STYLES_CSS = fileURLToPath(new URL('../../styles.css', import.meta.url));

// --- token resolution -------------------------------------------------------

const WHITE: RgbColor = { r: 255, g: 255, b: 255 };
const BLACK: RgbColor = { r: 0, g: 0, b: 0 };

/** `--name: value;` pairs from both stylesheets, later files winning. */
function readVariables(): ReadonlyMap<string, string> {
	const vars = new Map<string, string>();
	for (const file of [TOKENS_CSS, STYLES_CSS]) {
		const css = readFileSync(file, 'utf8')
			.replace(/\/\*[\s\S]*?\*\//g, '')
			.replace(/\s+/g, ' ');
		// balanced-paren capture: values contain nested `color-mix(...)`
		const re = /(--[a-z0-9-]+)\s*:/gi;
		let match = re.exec(css);
		while (match !== null) {
			let depth = 0;
			let i = match.index + match[0].length;
			let end = i;
			for (; i < css.length; i++) {
				const ch = css[i];
				if (ch === '(') depth++;
				else if (ch === ')') depth--;
				else if (ch === ';' && depth === 0) break;
			}
			end = i;
			vars.set(match[1] as string, css.slice(match.index + match[0].length, end).trim());
			match = re.exec(css);
		}
	}
	return vars;
}

const VARS = readVariables();

function splitTopLevel(input: string): string[] {
	const parts: string[] = [];
	let depth = 0;
	let current = '';
	for (const ch of input) {
		if (ch === '(') depth++;
		if (ch === ')') depth--;
		if (ch === ',' && depth === 0) {
			parts.push(current.trim());
			current = '';
			continue;
		}
		current += ch;
	}
	if (current.trim() !== '') parts.push(current.trim());
	return parts;
}

/** Resolves `var()`, `color-mix(in oklch, …)`, `oklch()` and hex to sRGB. */
function resolve(value: string, seen = new Set<string>()): RgbColor {
	const v = value.trim();

	const varMatch = /^var\(\s*(--[a-z0-9-]+)\s*\)$/i.exec(v);
	if (varMatch) {
		const name = varMatch[1] as string;
		if (seen.has(name)) throw new Error(`circular token reference: ${name}`);
		const next = VARS.get(name);
		if (next === undefined) throw new Error(`unknown token: ${name}`);
		return resolve(next, new Set(seen).add(name));
	}

	if (v.startsWith('color-mix(')) {
		const args = splitTopLevel(v.slice('color-mix('.length, -1));
		const [space, first, second] = args;
		if (space?.trim() !== 'in oklch') {
			throw new Error(`only "in oklch" mixes are supported, got: ${space}`);
		}
		const parse = (arg: string): { colour: string; pct: number | null } => {
			const m = /\s(\d+(?:\.\d+)?)%$/.exec(arg);
			return m
				? { colour: arg.slice(0, m.index).trim(), pct: Number(m[1]) }
				: { colour: arg.trim(), pct: null };
		};
		const a = parse(first as string);
		const b = parse(second as string);
		const aPct = a.pct ?? (b.pct === null ? 50 : 100 - b.pct);
		const p = aPct / 100;

		// `transparent` composites toward the other colour, which is what these
		// tokens rely on for their washes.
		const toPolar = (arg: { colour: string }, other: RgbColor) =>
			arg.colour === 'transparent' ? rgbToOklch(other) : rgbToOklch(resolve(arg.colour, seen));
		const bRgbForA = b.colour === 'transparent' ? WHITE : resolve(b.colour, seen);
		const aRgbForB = a.colour === 'transparent' ? WHITE : resolve(a.colour, seen);
		const aPolar = toPolar(a, bRgbForA);
		const bPolar = toPolar(b, aRgbForB);
		const rect = ({ lightness, chroma, hue }: OklchColor) =>
			[
				lightness,
				chroma * Math.cos((hue * Math.PI) / 180),
				chroma * Math.sin((hue * Math.PI) / 180),
			] as const;
		const [la, aa, ba] = rect(aPolar);
		const [lb, ab, bb] = rect(bPolar);
		const L = la * p + lb * (1 - p);
		const A = aa * p + ab * (1 - p);
		const B = ba * p + bb * (1 - p);
		let h = (Math.atan2(B, A) * 180) / Math.PI;
		if (h < 0) h += 360;
		return oklchToRgb({ lightness: L, chroma: Math.hypot(A, B), hue: h });
	}

	const oklchMatch = /^oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)\s*\)$/i.exec(v);
	if (oklchMatch) {
		const rawL = Number(oklchMatch[1]);
		return oklchToRgb({
			lightness: oklchMatch[2] === '%' ? rawL / 100 : rawL,
			chroma: Number(oklchMatch[3]),
			hue: Number(oklchMatch[4]),
		});
	}

	const hexMatch = /^#([0-9a-f]{6})$/i.exec(v);
	if (hexMatch) {
		const hex = hexMatch[1] as string;
		const [r, g, b] = [0, 2, 4].map((i) => Number.parseInt(hex.slice(i, i + 2), 16)) as [
			number,
			number,
			number,
		];
		return { r, g, b };
	}

	if (v === 'white') return WHITE;
	if (v === 'black') return BLACK;

	throw new Error(`unsupported colour value: ${v}`);
}

const token = (name: string): RgbColor => resolve(`var(${name})`);

/** A colour a browser could paint: three whole channels, none out of range. */
function expectPaintable({ r, g, b }: RgbColor): void {
	for (const channel of [r, g, b]) {
		expect(Number.isInteger(channel)).toBe(true);
		expect(channel).toBeGreaterThanOrEqual(0);
		expect(channel).toBeLessThanOrEqual(255);
	}
}
const ratio = (fg: string, bg: string): number => contrastRatio(token(fg), token(bg));

// --- the guard --------------------------------------------------------------

/** WCAG 2.2 AA. Normal text 4.5:1; UI components and focus indicators 3:1. */
const TEXT_AA = 4.5;
const NON_TEXT_AA = 3;

/** Every surface a control can sit on, and therefore that a ring must clear. */
const LIGHT_SURFACES = ['--background', '--card', '--muted', '--surface-strong', '--accent'];

describe('semantic token contrast', () => {
	describe('state colours (the ones visual review misses)', () => {
		it('focus ring clears 3:1 on every light surface it can land on', () => {
			for (const surface of LIGHT_SURFACES) {
				expect(
					ratio('--ring', surface),
					`--ring on ${surface} must clear ${NON_TEXT_AA}:1 (WCAG 1.4.11)`,
				).toBeGreaterThanOrEqual(NON_TEXT_AA);
			}
		});

		it('inverse focus ring clears 3:1 on the dark rail', () => {
			expect(ratio('--ring-inverse', '--simmer-green-900')).toBeGreaterThanOrEqual(NON_TEXT_AA);
		});

		it('destructive works as error text, not just as a fill', () => {
			// `text-destructive` carries every FieldError and ~50 inline messages.
			for (const surface of ['--background', '--card', '--muted']) {
				expect(
					ratio('--destructive', surface),
					`--destructive as text on ${surface} must clear ${TEXT_AA}:1`,
				).toBeGreaterThanOrEqual(TEXT_AA);
			}
		});

		it('destructive fill carries its own foreground', () => {
			expect(ratio('--destructive-foreground', '--destructive')).toBeGreaterThanOrEqual(TEXT_AA);
			// The destructive Button variant hard-codes `text-white`.
			expect(contrastRatio(WHITE, token('--destructive'))).toBeGreaterThanOrEqual(TEXT_AA);
		});

		it('status tones are readable on their paired backgrounds', () => {
			const pairs: readonly (readonly [string, string])[] = [
				['--success', '--success-bg'],
				['--warning', '--warning-bg'],
				// The environment banner fills with `--attention` rather than the pale
				// `--warning-bg`, because a strip nobody notices is a strip that failed.
				['--warning', '--attention'],
				['--info', '--info-bg'],
				['--catalog', '--catalog-bg'],
				['--danger', '--danger-bg'],
			];
			for (const [fg, bg] of pairs) {
				expect(ratio(fg, bg), `${fg} on ${bg}`).toBeGreaterThanOrEqual(TEXT_AA);
			}
		});

		it('form control borders are distinguishable from their surface', () => {
			for (const surface of ['--background', '--card']) {
				expect(
					ratio('--input', surface),
					`--input on ${surface} must clear ${NON_TEXT_AA}:1 (WCAG 1.4.11)`,
				).toBeGreaterThanOrEqual(NON_TEXT_AA);
			}
		});
	});

	describe('body and supporting copy', () => {
		it('foreground and muted-foreground clear AA on every surface', () => {
			for (const surface of LIGHT_SURFACES) {
				expect(ratio('--foreground', surface), `--foreground on ${surface}`).toBeGreaterThanOrEqual(
					TEXT_AA,
				);
				expect(
					ratio('--muted-foreground', surface),
					`--muted-foreground on ${surface}`,
				).toBeGreaterThanOrEqual(TEXT_AA);
			}
		});

		it('quiet metadata clears AA on the surfaces admin puts it on', () => {
			// `--quiet` is 12px caption text in apps/admin — normal size, so 4.5:1.
			for (const surface of ['--background', '--card', '--muted']) {
				expect(ratio('--quiet', surface), `--quiet on ${surface}`).toBeGreaterThanOrEqual(TEXT_AA);
			}
		});

		it('primary and sidebar pairs carry their own foreground', () => {
			expect(ratio('--primary-foreground', '--primary')).toBeGreaterThanOrEqual(TEXT_AA);
			expect(ratio('--secondary-foreground', '--secondary')).toBeGreaterThanOrEqual(TEXT_AA);
			expect(ratio('--accent-foreground', '--accent')).toBeGreaterThanOrEqual(TEXT_AA);
			expect(ratio('--sidebar-foreground', '--sidebar')).toBeGreaterThanOrEqual(TEXT_AA);
			expect(ratio('--sidebar-primary-foreground', '--sidebar-primary')).toBeGreaterThanOrEqual(
				TEXT_AA,
			);
		});
	});

	describe('resolver', () => {
		it('resolves var, nested color-mix, and both oklch lightness forms', () => {
			// --background -> var -> color-mix(in oklch, var(--simmer-green-50) 54%, oklch(99% …))
			expectPaintable(token('--background'));
			// tokens.css writes some values with decimal L rather than percent
			expectPaintable(token('--simmer-purple'));
			expect(() => token('--does-not-exist')).toThrow(/unknown token/);
		});
	});
});
