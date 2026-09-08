/**
 * The colour maths behind every contrast answer this workspace gives.
 *
 * Four places computed it before this module existed: the design-token screen
 * in `apps/preview`, the semantic-token contrast guard in `packages/ui-web`,
 * the hex mirror guard beside this file, and the basemap contrast pass in
 * `scripts/map-style/contrast.mjs`. Three of the four carried the sRGB
 * luminance coefficients and three carried the OKLCH matrix, and they had
 * already drifted on the linearization knee: one wrote the value from an
 * earlier revision of the same specification, and the rest wrote the current
 * one below.
 *
 * Nothing on screen was wrong because of it. Every caller feeds integer sRGB
 * channels and no integer channel falls between the two knees, so the drift
 * never changed a printed number. It is worth reading as what it was: four
 * copies moving apart with nothing holding them together.
 *
 * This lives in `design-tokens` because a contrast answer is a statement about
 * the tokens, and the package that owns the values is the one that should be
 * able to measure them.
 */

export interface RgbColor {
	readonly r: number;
	readonly g: number;
	readonly b: number;
}

/** sRGB channel in polar OKLCH: lightness 0-1, chroma, hue in degrees. */
export interface OklchColor {
	readonly lightness: number;
	readonly chroma: number;
	readonly hue: number;
}

/** The sRGB linearization knee, from WCAG 2.x and IEC 61966-2-1. */
const LINEARIZATION_KNEE = 0.04045;

/** The reverse knee, on the encoding side. */
const ENCODING_KNEE = 0.0031308;

/** Six-digit hex, with or without the hash. */
const HEX = /^#?([\da-f]{6})$/i;

/**
 * `oklch(L C H)`, lightness as a percentage or as a 0-1 decimal.
 *
 * Anchored, and that is the point. Unanchored it matched the first `oklch()`
 * anywhere in the string, so a `color-mix()` read as whichever colour was
 * written first and nothing returned `null` to say so.
 *
 * The per-cent sign is captured rather than skipped. Which of the two forms a
 * value is written in is written down, and reading it off the magnitude gets
 * `oklch(1% 0 0)` wrong in the loudest way available: near-black comes back as
 * white. Nothing in the token set is written that way, so this changes no
 * colour on screen today. It is the resolver in `packages/ui-web`'s contrast
 * suite that had it right, and folding that copy into this one is no reason to
 * take the right answer out.
 */
const OKLCH = /^oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)(?:deg)?\s*\)$/i;

/** `color-mix(in oklch, …)`, capturing the two colours and their shares. */
const OKLCH_MIX = /^color-mix\(\s*in\s+oklch\s*,([\s\S]*)\)$/i;

/** A share written after its colour, `oklch(…) 54%`. */
const TRAILING_PERCENTAGE = /^([\s\S]*\S)\s+([\d.]+)%$/;

/** A share written before it, `54% oklch(…)`, which CSS also allows. */
const LEADING_PERCENTAGE = /^([\d.]+)%\s+([\s\S]*\S)$/;

/** The whole of a mix, in the percentage points its shares are written in. */
const WHOLE_SHARE = 100;

/** Chroma below this reads as grey, and a grey converted from sRGB has no hue. */
const ACHROMATIC = 1e-6;

/**
 * Reads an `oklch()` function, a `color-mix(in oklch, …)` of two of them, or a
 * six-digit hex, and returns `null` for anything else.
 *
 * The mix arm exists because `getComputedStyle` does not evaluate one. An
 * unregistered custom property computes to its specified value with `var()`
 * substituted and nothing else, so a caller reading `--background` off the live
 * document gets the `color-mix()` text and has to do the interpolation itself.
 *
 * `null` rather than a throw because the caller that reads live CSS gets
 * whatever the browser resolved a variable to, including the empty string
 * before the effect that fills it has run.
 */
export function parseCssColor(value: string): RgbColor | null {
	const hex = parseHex(value);
	if (hex !== null) return hex;

	const polar = parseCssOklch(value);
	return polar === null ? null : oklchToRgb(polar.colour);
}

function parseHex(value: string): RgbColor | null {
	const hex = HEX.exec(value.trim());
	if (hex === null) return null;
	const raw = hex[1] ?? '';
	return {
		r: Number.parseInt(raw.slice(0, 2), 16),
		g: Number.parseInt(raw.slice(2, 4), 16),
		b: Number.parseInt(raw.slice(4, 6), 16),
	};
}

/**
 * A colour on its way into a mix.
 *
 * `hueMissing` is the part a plain `OklchColor` cannot carry. A colour
 * converted from sRGB with no chroma left has no hue to convert, so CSS calls
 * its hue missing and a mix takes the other side's instead. A hue somebody
 * wrote down is never missing, even at zero chroma, which is why this is a flag
 * on the read rather than a test on the chroma.
 */
interface ParsedOklch {
	readonly colour: OklchColor;
	readonly hueMissing: boolean;
}

/**
 * The same read as `parseCssColor`, stopping in polar OKLCH.
 *
 * A mix interpolates there, so each side is wanted in that space rather than
 * rounded to eight-bit sRGB and converted back on the way in.
 */
function parseCssOklch(value: string): ParsedOklch | null {
	const trimmed = value.trim();

	const mix = OKLCH_MIX.exec(trimmed);
	if (mix !== null) return mixOklch(mix[1] ?? '');

	const oklch = OKLCH.exec(trimmed);
	if (oklch !== null) {
		const rawLightness = Number(oklch[1]);
		return {
			colour: {
				lightness: oklch[2] === '%' ? rawLightness / 100 : rawLightness,
				chroma: Number(oklch[3]),
				hue: Number(oklch[4]),
			},
			hueMissing: false,
		};
	}

	const hex = parseHex(trimmed);
	if (hex === null) return null;
	const colour = rgbToOklch(hex);
	return { colour, hueMissing: colour.chroma < ACHROMATIC };
}

/** One side of a mix: the colour, and the share it was given if it was given one. */
interface MixSide extends ParsedOklch {
	readonly share: number | null;
}

/** Everything after `in oklch,`, back as one colour. */
function mixOklch(argumentList: string): ParsedOklch | null {
	const parts = splitTopLevel(argumentList);
	if (parts.length !== 2) return null;

	const first = parseMixSide(parts[0] ?? '');
	const second = parseMixSide(parts[1] ?? '');
	if (first === null || second === null) return null;

	const weight = firstWeight(first.share, second.share);
	if (weight === null) return null;

	return {
		colour: interpolateOklch(first, second, weight),
		hueMissing: first.hueMissing && second.hueMissing,
	};
}

function parseMixSide(input: string): MixSide | null {
	const { colour, share } = splitShare(input.trim());
	const parsed = parseCssOklch(colour);
	return parsed === null ? null : { ...parsed, share };
}

/** A side's colour and its share, which CSS lets you write on either side of it. */
function splitShare(input: string): { colour: string; share: number | null } {
	const trailing = TRAILING_PERCENTAGE.exec(input);
	if (trailing !== null) return { colour: trailing[1] ?? '', share: toShare(trailing[2]) };

	const leading = LEADING_PERCENTAGE.exec(input);
	if (leading !== null) return { colour: leading[2] ?? '', share: toShare(leading[1]) };

	return { colour: input, share: null };
}

function toShare(text: string | undefined): number {
	return Math.min(WHOLE_SHARE, Math.max(0, Number(text)));
}

/**
 * The first colour's share of the mix, 0 to 1.
 *
 * A share nobody wrote is whatever the other one leaves. Two that add to more
 * than 100 are normalized against their own total, and two that add to less
 * make the result that much transparent, which is a colour this module has no
 * way to answer with, so it answers `null` instead.
 */
function firstWeight(first: number | null, second: number | null): number | null {
	if (first === null && second === null) return 0.5;
	const a = first ?? Math.max(0, WHOLE_SHARE - (second ?? 0));
	const b = second ?? Math.max(0, WHOLE_SHARE - (first ?? 0));
	const total = a + b;
	return total < WHOLE_SHARE ? null : a / total;
}

/**
 * Interpolates in polar OKLCH the way `color-mix(in oklch, …)` does, taking the
 * short way around the hue circle.
 */
function interpolateOklch(first: MixSide, second: MixSide, weight: number): OklchColor {
	const firstHue = first.hueMissing ? second.colour.hue : first.colour.hue;
	const secondHue = second.hueMissing ? first.colour.hue : second.colour.hue;

	let arc = (((secondHue - firstHue) % 360) + 360) % 360;
	if (arc > 180) arc -= 360;

	const hue = firstHue + arc * (1 - weight);
	return {
		lightness: first.colour.lightness * weight + second.colour.lightness * (1 - weight),
		chroma: first.colour.chroma * weight + second.colour.chroma * (1 - weight),
		hue: ((hue % 360) + 360) % 360,
	};
}

/** Splits on commas that are not inside a nested function. */
function splitTopLevel(input: string): string[] {
	const parts: string[] = [];
	let depth = 0;
	let current = '';
	for (const character of input) {
		if (character === '(') depth += 1;
		else if (character === ')') depth -= 1;
		if (character === ',' && depth === 0) {
			parts.push(current);
			current = '';
			continue;
		}
		current += character;
	}
	parts.push(current);
	return parts;
}

/** OKLCH to sRGB, clipping out-of-gamut channels the way a browser does. */
export function oklchToRgb({ lightness, chroma, hue }: OklchColor): RgbColor {
	const hueRadians = (hue * Math.PI) / 180;
	const a = Math.cos(hueRadians) * chroma;
	const b = Math.sin(hueRadians) * chroma;

	const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
	const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
	const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;

	return {
		r: encodeChannel(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
		g: encodeChannel(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
		b: encodeChannel(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
	};
}

/**
 * sRGB to OKLCH, the inverse of `oklchToRgb`.
 *
 * Interpolating a `color-mix(in oklch, …)` is what needs it: a mix is done in
 * polar OKLCH, so both sides have to get back there first.
 */
export function rgbToOklch({ r, g, b }: RgbColor): OklchColor {
	const rl = linearizeChannel(r);
	const gl = linearizeChannel(g);
	const bl = linearizeChannel(b);

	const l = Math.cbrt(0.4122214708 * rl + 0.5363325363 * gl + 0.0514459929 * bl);
	const m = Math.cbrt(0.2119034982 * rl + 0.6806995451 * gl + 0.1073969566 * bl);
	const s = Math.cbrt(0.0883024619 * rl + 0.2817188376 * gl + 0.6299787005 * bl);

	const lightness = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
	const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
	const bAxis = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;

	let hue = (Math.atan2(bAxis, a) * 180) / Math.PI;
	if (hue < 0) hue += 360;

	return { lightness, chroma: Math.hypot(a, bAxis), hue };
}

/** WCAG 2.x relative luminance, 0 for black and 1 for white. */
function relativeLuminance({ r, g, b }: RgbColor): number {
	return 0.2126 * linearizeChannel(r) + 0.7152 * linearizeChannel(g) + 0.0722 * linearizeChannel(b);
}

/** WCAG 2.x contrast, from 1:1 for a colour against itself to 21:1. */
export function contrastRatio(a: RgbColor, b: RgbColor): number {
	const first = relativeLuminance(a);
	const second = relativeLuminance(b);
	const lighter = Math.max(first, second);
	const darker = Math.min(first, second);
	return (lighter + 0.05) / (darker + 0.05);
}

/** What a ratio buys you, in the words the design-token screen prints. */
export type WcagLevel = 'AA' | 'Large text' | 'Low';

/**
 * The WCAG 2.2 AA contrast floors, written here because they were written
 * three times and two of them are not the same rule.
 *
 * `TEXT_AA` and `LARGE_TEXT_AA` are both success criterion 1.4.3, which asks
 * 4.5:1 of normal text and lets large text down to 3:1. `NON_TEXT_AA` is 1.4.11,
 * a different criterion, which asks 3:1 of user-interface components and
 * graphical objects: a focus ring, a control border, a map mark.
 *
 * **`LARGE_TEXT_AA` and `NON_TEXT_AA` hold the same number and are not the same
 * rule.** Do not collapse them on the grounds that they are equal. A change to
 * one is not a change to the other, and one constant standing for both would
 * assert an equality WCAG does not.
 *
 * The two that are exported are the two something outside this module reads:
 * `packages/ui-web/src/tests/unit/styles.contrast.test.ts` asserts on both and
 * `scripts/map-style/contrast.mjs` measures every map mark against `NON_TEXT_AA`.
 * `LARGE_TEXT_AA` stays private because `wcagLevel` below is its only reader and
 * `fallow dead-code` gates an unused export at zero.
 */
export const TEXT_AA = 4.5;
const LARGE_TEXT_AA = 3;
export const NON_TEXT_AA = 3;

export function wcagLevel(ratio: number): WcagLevel {
	if (ratio >= TEXT_AA) return 'AA';
	if (ratio >= LARGE_TEXT_AA) return 'Large text';
	return 'Low';
}

export function formatHex({ r, g, b }: RgbColor): string {
	return `#${[r, g, b].map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}

export function formatRgb({ r, g, b }: RgbColor): string {
	return `rgb(${r} ${g} ${b})`;
}

/** One 0-255 channel to linear light. */
function linearizeChannel(channel: number): number {
	const value = channel / 255;
	return value <= LINEARIZATION_KNEE ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

/** Linear light back to one 0-255 channel, clipped to the sRGB gamut. */
function encodeChannel(value: number): number {
	const encoded = value <= ENCODING_KNEE ? 12.92 * value : 1.055 * value ** (1 / 2.4) - 0.055;
	return Math.round(Math.min(1, Math.max(0, encoded)) * 255);
}
