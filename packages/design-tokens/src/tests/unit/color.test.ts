import { describe, expect, it } from 'vitest';
import {
	contrastRatio,
	formatHex,
	formatRgb,
	oklchToRgb,
	parseCssColor,
	rgbToOklch,
	wcagLevel,
} from '../../color.js';

const hex = (value: string) => {
	const parsed = parseCssColor(value);
	if (parsed === null) throw new Error(`not a colour: ${value}`);
	return parsed;
};

const WHITE = hex('#ffffff');
const BLACK = hex('#000000');

/**
 * Published pairs, not values this module produced. Every ratio below is the
 * number WebAIM's contrast checker prints for that pair, which is what a
 * designer compares against when they doubt a badge on the token screen.
 */
describe('contrastRatio', () => {
	it.each([
		{ label: 'white on black', a: WHITE, b: BLACK, ratio: 21 },
		{ label: 'white on white', a: WHITE, b: WHITE, ratio: 1 },
		// #767676 is the canonical darkest grey that still clears 4.5:1 on white,
		// and #949494 the darkest that clears 3:1 and no more.
		{ label: '#767676 on white', a: hex('#767676'), b: WHITE, ratio: 4.54 },
		{ label: '#949494 on white', a: hex('#949494'), b: WHITE, ratio: 3.03 },
		{ label: '#595959 on white', a: hex('#595959'), b: WHITE, ratio: 7.0 },
		{ label: 'sRGB blue on white', a: hex('#0000ff'), b: WHITE, ratio: 8.59 },
		{ label: 'sRGB red on white', a: hex('#ff0000'), b: WHITE, ratio: 4.0 },
		{ label: 'sRGB green on white', a: hex('#008000'), b: WHITE, ratio: 5.14 },
	])('$label is $ratio:1', ({ a, b, ratio }) => {
		expect(contrastRatio(a, b)).toBeCloseTo(ratio, 2);
	});

	it('does not care which colour is named first', () => {
		expect(contrastRatio(BLACK, WHITE)).toBeCloseTo(contrastRatio(WHITE, BLACK), 10);
	});
});

/**
 * The OKLCH coordinates of the three sRGB primaries are published constants, so
 * a wrong sign anywhere in the matrix moves one of them off its hex.
 */
const PRIMARIES = [
	{ label: 'red', hex: '#ff0000', lightness: 0.62796, chroma: 0.25768, hue: 29.234 },
	{ label: 'green', hex: '#00ff00', lightness: 0.86644, chroma: 0.29483, hue: 142.495 },
	{ label: 'blue', hex: '#0000ff', lightness: 0.45201, chroma: 0.31321, hue: 264.052 },
] as const;

describe('oklchToRgb', () => {
	it.each(PRIMARIES)('$label converts to $hex', ({ hex: expected, lightness, chroma, hue }) => {
		expect(formatHex(oklchToRgb({ lightness, chroma, hue }))).toBe(expected);
	});

	it.each([
		{ label: 'white', lightness: 1, chroma: 0, hue: 0, hex: '#ffffff' },
		{ label: 'black', lightness: 0, chroma: 0, hue: 0, hex: '#000000' },
	])('$label converts to $hex', ({ hex: expected, lightness, chroma, hue }) => {
		expect(formatHex(oklchToRgb({ lightness, chroma, hue }))).toBe(expected);
	});

	it('clips a colour outside the sRGB gamut rather than wrapping it', () => {
		// Full lightness at that much chroma puts every channel out of range, and
		// an unclipped encode reads back as a colour from somewhere else entirely.
		const clipped = oklchToRgb({ lightness: 1, chroma: 0.4, hue: 30 });
		for (const channel of [clipped.r, clipped.g, clipped.b]) {
			expect(channel).toBeGreaterThanOrEqual(0);
			expect(channel).toBeLessThanOrEqual(255);
		}
	});
});

describe('rgbToOklch', () => {
	it.each(PRIMARIES)('$label reads back as its published coordinates', (primary) => {
		const measured = rgbToOklch(hex(primary.hex));
		expect(measured.lightness).toBeCloseTo(primary.lightness, 4);
		expect(measured.chroma).toBeCloseTo(primary.chroma, 4);
		expect(measured.hue).toBeCloseTo(primary.hue, 2);
	});

	it('reports no chroma for a grey', () => {
		expect(rgbToOklch(hex('#808080')).chroma).toBeCloseTo(0, 6);
	});
});

describe('parseCssColor', () => {
	it.each([
		{ label: 'hex with a hash', value: '#4ba272' },
		{ label: 'hex without one', value: '4ba272' },
		{ label: 'uppercase hex', value: '#4BA272' },
	])('reads $label', ({ value }) => {
		expect(parseCssColor(value)).toEqual({ r: 0x4b, g: 0xa2, b: 0x72 });
	});

	it('reads both lightness forms, which tokens.css writes both of', () => {
		// `--simmer-green-400` is a percentage and `--simmer-purple` a decimal.
		expect(parseCssColor('oklch(64.6% 0.112 157)')).toEqual(
			parseCssColor('oklch(0.646 0.112 157)'),
		);
	});

	it.each([
		{ label: 'the empty string a CSS variable reads as before it resolves', value: '' },
		{ label: 'a keyword', value: 'transparent' },
		{ label: 'a three-digit hex', value: '#abc' },
	])('returns null for $label', ({ value }) => {
		expect(parseCssColor(value)).toBeNull();
	});
});

describe('wcagLevel', () => {
	it.each([
		{ label: 'the AA floor itself', ratio: 4.5, level: 'AA' },
		{ label: 'body copy on paper', ratio: 12.4, level: 'AA' },
		{ label: 'a hair under the AA floor', ratio: 4.49, level: 'Large text' },
		{ label: 'the large-text floor itself', ratio: 3, level: 'Large text' },
		{ label: 'a hair under the large-text floor', ratio: 2.99, level: 'Low' },
		{ label: 'a colour against itself', ratio: 1, level: 'Low' },
	])('calls $label $level', ({ ratio, level }) => {
		expect(wcagLevel(ratio)).toBe(level);
	});
});

describe('formatting', () => {
	it('pads a channel that needs a leading zero', () => {
		expect(formatHex({ r: 0, g: 8, b: 255 })).toBe('#0008ff');
	});

	it('writes rgb the space-separated way CSS prints it', () => {
		expect(formatRgb({ r: 16, g: 35, b: 37 })).toBe('rgb(16 35 37)');
	});
});
