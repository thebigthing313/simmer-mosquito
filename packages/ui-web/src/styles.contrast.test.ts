import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
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
 */

const TOKENS_CSS = fileURLToPath(new URL('../../design-tokens/src/tokens.css', import.meta.url));
const STYLES_CSS = fileURLToPath(new URL('./styles.css', import.meta.url));

// --- colour maths -----------------------------------------------------------

type Rgb = readonly [number, number, number];

function oklchToRgb(L: number, C: number, hDeg: number): Rgb {
	const h = (hDeg * Math.PI) / 180;
	const a = C * Math.cos(h);
	const b = C * Math.sin(h);
	const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
	const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
	const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
	const lin = [
		4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
		-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
		-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
	];
	return lin.map((v) => {
		const enc = v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
		return Math.min(255, Math.max(0, Math.round(enc * 255)));
	}) as unknown as Rgb;
}

function rgbToOklch(rgb: Rgb): readonly [number, number, number] {
	const [r, g, b] = rgb.map((v) => {
		const c = v / 255;
		return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
	}) as unknown as Rgb;
	const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
	const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
	const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
	const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
	const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
	const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
	let h = (Math.atan2(B, A) * 180) / Math.PI;
	if (h < 0) h += 360;
	return [L, Math.hypot(A, B), h];
}

function relativeLuminance(rgb: Rgb): number {
	const [r, g, b] = rgb.map((v) => {
		const c = v / 255;
		return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
	}) as unknown as Rgb;
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(a: Rgb, b: Rgb): number {
	const la = relativeLuminance(a);
	const lb = relativeLuminance(b);
	const hi = Math.max(la, lb);
	const lo = Math.min(la, lb);
	return (hi + 0.05) / (lo + 0.05);
}

// --- token resolution -------------------------------------------------------

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
function resolve(value: string, seen = new Set<string>()): Rgb {
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
		const toPolar = (arg: { colour: string }, other: Rgb) =>
			arg.colour === 'transparent' ? rgbToOklch(other) : rgbToOklch(resolve(arg.colour, seen));
		const bRgbForA =
			b.colour === 'transparent' ? ([255, 255, 255] as const) : resolve(b.colour, seen);
		const aRgbForB =
			a.colour === 'transparent' ? ([255, 255, 255] as const) : resolve(a.colour, seen);
		const [L1, C1, H1] = toPolar(a, bRgbForA);
		const [L2, C2, H2] = toPolar(b, aRgbForB);
		const rect = (L: number, C: number, H: number) =>
			[L, C * Math.cos((H * Math.PI) / 180), C * Math.sin((H * Math.PI) / 180)] as const;
		const [la, aa, ba] = rect(L1, C1, H1);
		const [lb, ab, bb] = rect(L2, C2, H2);
		const L = la * p + lb * (1 - p);
		const A = aa * p + ab * (1 - p);
		const B = ba * p + bb * (1 - p);
		let h = (Math.atan2(B, A) * 180) / Math.PI;
		if (h < 0) h += 360;
		return oklchToRgb(L, Math.hypot(A, B), h);
	}

	const oklchMatch = /^oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)\s*\)$/i.exec(v);
	if (oklchMatch) {
		const rawL = Number(oklchMatch[1]);
		return oklchToRgb(
			oklchMatch[2] === '%' ? rawL / 100 : rawL,
			Number(oklchMatch[3]),
			Number(oklchMatch[4]),
		);
	}

	const hexMatch = /^#([0-9a-f]{6})$/i.exec(v);
	if (hexMatch) {
		const hex = hexMatch[1] as string;
		return [0, 2, 4].map((i) => Number.parseInt(hex.slice(i, i + 2), 16)) as unknown as Rgb;
	}

	if (v === 'white') return [255, 255, 255];
	if (v === 'black') return [0, 0, 0];

	throw new Error(`unsupported colour value: ${v}`);
}

const token = (name: string): Rgb => resolve(`var(${name})`);
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
			expect(contrastRatio([255, 255, 255], token('--destructive'))).toBeGreaterThanOrEqual(
				TEXT_AA,
			);
		});

		it('status tones are readable on their paired backgrounds', () => {
			const pairs: readonly (readonly [string, string])[] = [
				['--success', '--success-bg'],
				['--warning', '--warning-bg'],
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
			expect(token('--background')).toHaveLength(3);
			// tokens.css writes some values with decimal L rather than percent
			expect(token('--simmer-purple')).toHaveLength(3);
			expect(() => token('--does-not-exist')).toThrow(/unknown token/);
		});
	});
});
