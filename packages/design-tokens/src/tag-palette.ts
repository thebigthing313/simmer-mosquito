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
