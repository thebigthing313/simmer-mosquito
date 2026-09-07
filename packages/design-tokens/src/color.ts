/**
 * The colour maths behind every contrast answer this workspace gives.
 *
 * Four places computed it before this module existed: the design-token screen
 * in `apps/preview`, the semantic-token contrast guard in `packages/ui-web`,
 * the hex mirror guard beside this file, and the basemap contrast pass in
 * `scripts/map-style/contrast.mjs`. Three of the four carried the sRGB
 * luminance coefficients and three carried the OKLCH matrix, and they had
 * already drifted on the linearization knee: one wrote `0.03928`, from an
 * earlier revision of the same specification, and the rest wrote `0.04045`.
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

/** `oklch(L C H)`, lightness as a percentage or as a 0-1 decimal. */
const OKLCH = /oklch\(\s*([\d.]+)%?\s+([\d.]+)\s+([\d.]+)(?:deg)?/i;

/**
 * Reads an `oklch()` function or a six-digit hex, and returns `null` for
 * anything else.
 *
 * `null` rather than a throw because the caller that reads live CSS gets
 * whatever the browser resolved a variable to, including the empty string
 * before the effect that fills it has run.
 */
export function parseCssColor(value: string): RgbColor | null {
	const oklch = OKLCH.exec(value);
	if (oklch !== null) {
		const rawLightness = Number(oklch[1]);
		return oklchToRgb({
			lightness: rawLightness > 1 ? rawLightness / 100 : rawLightness,
			chroma: Number(oklch[2]),
			hue: Number(oklch[3]),
		});
	}

	const hex = HEX.exec(value);
	if (hex !== null) {
		const raw = hex[1] ?? '';
		return {
			r: Number.parseInt(raw.slice(0, 2), 16),
			g: Number.parseInt(raw.slice(2, 4), 16),
			b: Number.parseInt(raw.slice(4, 6), 16),
		};
	}

	return null;
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

/** WCAG 2.2 AA: 4.5:1 for normal text, 3:1 for large text and UI components. */
const TEXT_AA = 4.5;
const LARGE_TEXT_AA = 3;

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
