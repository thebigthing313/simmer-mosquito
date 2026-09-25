import { describe, expect, it } from 'vitest';
import {
	compositeOver,
	contrastRatio,
	parseCssColor,
	readableOn,
	rgbToOklch,
	TEXT_AA,
} from '../../color.js';
import { tagChipColors, tagPalette } from '../../tag-palette.js';

const hex = (value: string) => {
	const parsed = parseCssColor(value);
	if (parsed === null) throw new Error(`not a colour: ${value}`);
	return parsed;
};

/**
 * The tag chip drew the Organization's colour as 12px text on a 14% tint of
 * itself, 1.8 to 3.0:1 across the preset palette. These hold the text to 4.5:1
 * against the fill it is drawn on, and the hue to the one the Organization
 * picked.
 */
describe('tagChipColors', () => {
	it.each(
		tagPalette.map((entry) => [entry.label, entry.hex] as const),
	)('draws %s text at 4.5:1 or better on its own fill', (_label, color) => {
		const chip = tagChipColors(color);
		if (chip === null) throw new Error('expected chip colours');

		expect(contrastRatio(hex(chip.text), hex(chip.background))).toBeGreaterThanOrEqual(TEXT_AA);
	});

	it('keeps the hue of a chromatic colour', () => {
		const chip = tagChipColors('#3b82f6');
		if (chip === null) throw new Error('expected chip colours');

		const picked = rgbToOklch(hex('#3b82f6'));
		const drawn = rgbToOklch(hex(chip.text));
		expect(Math.abs(drawn.hue - picked.hue)).toBeLessThan(6);
		expect(drawn.lightness).toBeLessThan(picked.lightness);
	});

	it('leaves a colour that already reads alone', () => {
		expect(tagChipColors('#1f2937')?.text).toBe('#1f2937');
	});

	it('answers null for anything but a six-digit hex', () => {
		expect(tagChipColors('#abc')).toBeNull();
		expect(tagChipColors('red')).toBeNull();
		expect(tagChipColors('')).toBeNull();
	});
});

describe('readableOn', () => {
	const WHITE = hex('#ffffff');
	const BLACK = hex('#000000');

	it('darkens on a light background and lightens on a dark one', () => {
		const yellow = hex('#eab308');

		const onLight = readableOn(yellow, WHITE, TEXT_AA);
		const onDark = readableOn(hex('#1e3a8a'), BLACK, TEXT_AA);

		expect(contrastRatio(onLight, WHITE)).toBeGreaterThanOrEqual(TEXT_AA);
		expect(rgbToOklch(onLight).lightness).toBeLessThan(rgbToOklch(yellow).lightness);
		expect(contrastRatio(onDark, BLACK)).toBeGreaterThanOrEqual(TEXT_AA);
		expect(rgbToOklch(onDark).lightness).toBeGreaterThan(rgbToOklch(hex('#1e3a8a')).lightness);
	});

	it('stops close to the threshold rather than running to black', () => {
		const result = readableOn(hex('#ef4444'), WHITE, TEXT_AA);

		expect(contrastRatio(result, WHITE)).toBeLessThan(TEXT_AA + 0.2);
	});
});

describe('compositeOver', () => {
	it('blends per channel by the top colour share', () => {
		expect(compositeOver(hex('#ff0000'), 0.5, hex('#ffffff'))).toEqual({ r: 255, g: 128, b: 128 });
		expect(compositeOver(hex('#ff0000'), 0, hex('#00ff00'))).toEqual({ r: 0, g: 255, b: 0 });
		expect(compositeOver(hex('#ff0000'), 1, hex('#00ff00'))).toEqual({ r: 255, g: 0, b: 0 });
	});
});
