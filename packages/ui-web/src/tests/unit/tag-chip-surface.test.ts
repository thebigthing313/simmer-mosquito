import { fileURLToPath } from 'node:url';
import { TAG_CHIP_SURFACE } from '@simmer-mosquito/design-tokens';
import { describe, expect, it } from 'vitest';
import { readDeclarations } from '../../../../../scripts/lib/stylesheet-tokens.mjs';

/**
 * `tagChipColors` composites a tag's tint over a fixed surface to pick a text
 * colour that clears 4.5:1, so that surface has to be the one the chip sits on.
 * The case lives here rather than beside the palette because reading this
 * stylesheet from `design-tokens` made Nx see an edge to `scripts`, which
 * already depends on `design-tokens`, and the build graph refused the cycle.
 */
describe('TAG_CHIP_SURFACE', () => {
	it('is the value the card token paints', () => {
		const styles = fileURLToPath(new URL('../../styles.css', import.meta.url));
		const card = readDeclarations(styles).find(({ name }) => name === '--card');

		expect(card?.value).toBe(TAG_CHIP_SURFACE);
	});
});
