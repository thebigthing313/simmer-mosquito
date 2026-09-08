import { cva, type VariantProps } from 'class-variance-authority';

/**
 * The name of a record, rendered as the way into that record.
 *
 * The class string was written out 34 times across 24 files in `apps/web`, in 19
 * spellings, and only two of them had a name: a `recordLinkClass` on the
 * requests-for-control page and a `historyLinkClassName` on the habitat page,
 * each local to its file. Every new linked name copied a neighbour, so the
 * focus ring drifted while nothing said which spelling was the intended one.
 *
 * A class helper rather than a component, for the reason `backLink` in
 * `back-link.tsx` already gives: Router types `Link`'s `to` and `params` against the
 * generated route tree, and a wrapper would have to widen that generic. The
 * call sites are not one element anyway. Most are a `Link`, one is a `button`
 * that opens a panel, one is an `<a href="mailto:">`, and several sit inside a
 * table cell that owns its own truncation. A component that suited the `Link`s
 * would have left a third of them writing the string by hand.
 *
 * The three axes are the ones the copies actually varied on for a reason:
 *
 * - `tone`      — `name` is the record's own name and carries the row. `value`
 *                 is a name that is not the heading of its row. `muted` is a
 *                 secondary affordance beside other text. `inherit` takes the
 *                 colour of whatever it sits in.
 * - `size`      — `inherit` is a link inside text that already set a size.
 * - `underline` — an underline on hover, for a link with no colour change to
 *                 announce it.
 *
 * Everything else the copies carried is layout — `truncate`, `w-fit`,
 * `max-w-full`, `inline-flex items-center gap-1.5`, `pointer-events-auto`,
 * `min-w-0 flex-1` — and stays at the call site through `cn`, which is where
 * `DESIGN.md` puts layout, spacing and local placement.
 *
 * ## The ring offset is deliberately gone
 *
 * Twelve of the copies added `focus-visible:ring-offset-1`. Nothing in this
 * workspace sets `--tw-ring-offset-color`, so that utility falls back to white
 * and draws a one-pixel white halo on a dark card. The 22 copies without it
 * were right, and this is the shape they had.
 */
export const recordLink = cva(
	'rounded-sm hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
	{
		variants: {
			tone: {
				name: 'font-medium text-foreground',
				value: 'text-foreground',
				muted: 'text-muted-foreground',
				inherit: '',
			},
			size: {
				sm: 'text-sm',
				xs: 'text-xs',
				inherit: '',
			},
			underline: {
				none: '',
				hover: 'underline-offset-4 hover:underline',
			},
		},
		defaultVariants: {
			size: 'inherit',
			tone: 'name',
			underline: 'none',
		},
	},
);

export type RecordLinkVariants = VariantProps<typeof recordLink>;
