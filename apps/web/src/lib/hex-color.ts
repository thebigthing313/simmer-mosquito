import { tagChipColors } from '@simmer-mosquito/design-tokens';
import type { CSSProperties } from 'react';

/**
 * Hex colour handling for the organization-defined colours that reach the UI as
 * free text — tag colours, mostly, which an admin types into a settings field.
 *
 * These lived in eight copies across components and route files before this
 * module existed, in three variants that disagreed about the edge cases. The
 * chip style had four copies of its own, two of which took three-digit hex the
 * rest refused, and all of them read through `tagChipStyle` now.
 */

/**
 * A colour we are willing to put in a style attribute, or null.
 *
 * Deliberately strict: six hex digits, nothing else. A stored value that does
 * not match is treated as absent rather than passed through, so a typo in a
 * settings field cannot reach CSS and render as some browser's guess.
 */
export function validHexColor(value: string | null): string | null {
	if (value === null) {
		return null;
	}

	const normalized = value.trim();
	return /^#[0-9a-fA-F]{6}$/.test(normalized) ? normalized : null;
}

/**
 * The inline style a tag chip is drawn with, or null for the neutral chip.
 *
 * Border, fill and text all come from `tagChipColors` in
 * `@simmer-mosquito/design-tokens`, which keeps the tag's hue on the fill and
 * the border and darkens the text until it clears 4.5:1 on that fill. The
 * colours are opaque, so the ratio holds on any surface the chip sits on.
 */
export function tagChipStyle(value: string | null): CSSProperties | null {
	const color = validHexColor(value);
	const chip = color === null ? null : tagChipColors(color);
	if (chip === null) {
		return null;
	}
	return { backgroundColor: chip.background, borderColor: chip.border, color: chip.text };
}
