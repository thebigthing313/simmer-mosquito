import { cva, type VariantProps } from 'class-variance-authority';

/**
 * The pinned action bar at the foot of a scrolling panel — the counterpart to
 * {@link stickyHeader}, and the same surface, border, and `z-10` tier read
 * upside down.
 *
 * Long record forms are the reason it exists. Save and Reset sat at the very
 * end of the field list, so on any form taller than the panel the only way to
 * commit work was to scroll to the bottom to find the button — and the further
 * you were from the end, the less certain it was that saving was still
 * available at all. Pinned, the commitment is visible from the first field.
 *
 * The border is on top rather than the bottom, so content scrolling underneath
 * meets a rule instead of sliding out from behind the buttons.
 */
export const stickyFooter = cva('sticky bottom-0 z-10', {
	variants: {
		surface: {
			page: 'border-border/50 border-t bg-background',
			card: 'bg-card',
		},
		layout: {
			/** The default: controls trailing, extra items (delete) can lead with `mr-auto`. */
			row: 'flex flex-wrap items-center justify-end',
			stack: 'grid',
		},
		gap: {
			tight: 'gap-2',
			default: 'gap-3',
		},
		padding: {
			default: 'p-4',
			roomy: 'px-5 py-4',
			none: '',
		},
	},
	defaultVariants: {
		surface: 'page',
		layout: 'row',
		gap: 'tight',
		padding: 'default',
	},
});

export type StickyFooterVariants = VariantProps<typeof stickyFooter>;
