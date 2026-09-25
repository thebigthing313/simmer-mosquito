import { tagChipColors, tagPalette } from '@simmer-mosquito/design-tokens';
import { describe, expect, it } from 'vitest';
import { tagChipStyle } from '../../../lib/hex-color';

/**
 * Every tag chip in the app reads its three colours through `tagChipStyle`,
 * which is the register's answer drawn as an inline style. Four copies of the
 * style used to draw the tag's colour as text on a tint of itself.
 */
describe('tagChipStyle', () => {
	it('draws the register colours for a palette tag', () => {
		const [first] = tagPalette;
		if (first === undefined) throw new Error('empty palette');
		const chip = tagChipColors(first.hex);

		expect(tagChipStyle(first.hex)).toEqual({
			backgroundColor: chip?.background,
			borderColor: chip?.border,
			color: chip?.text,
		});
		expect(tagChipStyle(first.hex)?.color).not.toBe(first.hex);
	});

	it('falls back to the neutral chip for a missing or malformed colour', () => {
		expect(tagChipStyle(null)).toBeNull();
		expect(tagChipStyle('')).toBeNull();
		expect(tagChipStyle('not a colour')).toBeNull();
	});
});
