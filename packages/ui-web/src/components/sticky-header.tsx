import { cva, type VariantProps } from 'class-variance-authority';

/**
 * The pinned header bar at the top of a scrolling panel — explorer rails, form
 * sheets, and result lists all grow one.
 *
 * Two things were folded into this while consolidating the ~30 duplicate class
 * strings it replaces:
 *
 * 1. The surface is opaque. It used to be `bg-background/95` behind a
 *    `backdrop-blur-sm`. A blur behind a 95%-opaque surface has nothing to
 *    resolve — it bought a compositing layer on every scroll for an effect no
 *    one could see. Dropping the blur alone would have left 5% of the scrolling
 *    content bleeding through, which reads as a smear rather than a choice, so
 *    the surface went fully opaque instead. Blur stays where it earns its cost:
 *    the floating map controls, which genuinely sit over live basemap tiles.
 *
 * 2. `z-10` is the shared "pinned within a scroll container" level. It sits
 *    below the `z-50` overlay tier (dialogs, popovers, toasts) on purpose — a
 *    pinned header must never paint over an open menu.
 */
export const stickyHeader = cva('sticky top-0 z-10', {
	variants: {
		surface: {
			page: 'border-border/50 border-b bg-background',
			card: 'bg-card',
			/**
			 * For a header inside a floating panel that already paints a
			 * translucent surface, such as the map explorer's result panel. It
			 * paints no background of its own: a second fill over the panel's
			 * would composite denser than the panel around it and read as a
			 * separate white bar. Only use it where nothing scrolls underneath.
			 */
			chrome: 'border-border/50 border-b',
		},
		layout: {
			stack: 'grid',
			row: 'flex flex-wrap items-center justify-between',
			inline: 'flex items-center',
		},
		gap: {
			tight: 'gap-2',
			snug: 'gap-2.5',
			default: 'gap-3',
		},
		padding: {
			default: 'p-4',
			roomy: 'px-5 py-4',
			tight: 'px-1 py-1',
			none: '',
		},
	},
	defaultVariants: {
		surface: 'page',
		layout: 'stack',
		gap: 'default',
		padding: 'default',
	},
});

export type StickyHeaderVariants = VariantProps<typeof stickyHeader>;
