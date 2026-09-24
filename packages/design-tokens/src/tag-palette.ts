import { compositeOver, formatHex, parseCssColor, readableOn, TEXT_AA } from './color.js';

/**
 * Preset color palette offered to users when picking a tag color.
 * Hex values map to Tailwind's default color palette (500 weights),
 * chosen for visual distinction at small sizes.
 */

export interface TagPaletteEntry {
	readonly hex: string;
	readonly label: string;
}

export const tagPalette: readonly TagPaletteEntry[] = [
	{ hex: '#ef4444', label: 'Red' },
	{ hex: '#f97316', label: 'Orange' },
	{ hex: '#f59e0b', label: 'Amber' },
	{ hex: '#eab308', label: 'Yellow' },
	{ hex: '#84cc16', label: 'Lime' },
	{ hex: '#22c55e', label: 'Green' },
	{ hex: '#14b8a6', label: 'Teal' },
	{ hex: '#06b6d4', label: 'Cyan' },
	{ hex: '#3b82f6', label: 'Blue' },
	{ hex: '#6366f1', label: 'Indigo' },
	{ hex: '#8b5cf6', label: 'Violet' },
	{ hex: '#ec4899', label: 'Pink' },
	{ hex: '#78716c', label: 'Stone' },
	{ hex: '#1f2937', label: 'Slate' },
] as const;

/**
 * The surface a tag chip's fill is composited over. It is `--card` in
 * `packages/ui-web/src/styles.css`, and `tag-palette.test.ts` reads that
 * stylesheet and fails when the two disagree.
 */
export const TAG_CHIP_SURFACE = 'oklch(99% 0.004 165)';

/** The fill and border are the tag's own colour at these opacities over the surface. */
const CHIP_FILL_ALPHA = 0.14;
const CHIP_BORDER_ALPHA = 0.36;

/** The three colours a tag chip is drawn in, each an opaque six-digit hex. */
export interface TagChipColors {
	readonly background: string;
	readonly border: string;
	readonly text: string;
}

/**
 * The chip colours for a tag whose Organization picked \`hex\`, or null when
 * \`hex\` is not a six-digit colour.
 *
 * The chip used to draw the tag's colour as its text on a 14% tint of itself,
 * which measured 1.8 to 3.0:1 across this palette at 12px. The tint and the
 * border keep the hue; the text is the same hue darkened in OKLCH until it
 * clears 4.5:1 against the fill. The fill is composited here and drawn opaque,
 * so the ratio holds on whatever surface the chip lands on rather than only on
 * the one it was measured against.
 */
export function tagChipColors(hex: string): TagChipColors | null {
	const color = /^#[\da-f]{6}$/i.test(hex) ? parseCssColor(hex) : null;
	const surface = parseCssColor(TAG_CHIP_SURFACE);
	if (color === null || surface === null) {
		return null;
	}

	const background = compositeOver(color, CHIP_FILL_ALPHA, surface);
	return {
		background: formatHex(background),
		border: formatHex(compositeOver(color, CHIP_BORDER_ALPHA, surface)),
		text: formatHex(readableOn(color, background, TEXT_AA)),
	};
}
