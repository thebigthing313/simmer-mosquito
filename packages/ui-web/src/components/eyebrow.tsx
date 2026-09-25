import { cva } from 'class-variance-authority';

/**
 * The small uppercase label that names a group: a sidebar section, a list
 * heading, a field-group caption on a detail page.
 *
 * It was written out by hand in about thirty places in six sizes, from 0.62rem
 * to 0.78rem, with three different trackings and four weights, so two labels
 * doing the same job on neighbouring pages did not match. Every one now sits
 * on the caption step of the type scale.
 *
 * `primary` is the green heading the secondary sidebar groups its links under,
 * and the one place the label's weight reaches 800, which is what DESIGN.md's
 * Label role names. `muted` is the grey label over a group of fields or rows.
 * `inherit` takes the colour of whatever it sits in, for a label inside a
 * selected control or a card with a surface of its own.
 */
export const eyebrow = cva('m-0 text-caption uppercase leading-tight', {
	variants: {
		tone: {
			primary: 'font-extrabold text-primary tracking-[0.06em]',
			muted: 'font-semibold text-muted-foreground tracking-wide',
			inherit: 'font-semibold tracking-wide',
		},
	},
	defaultVariants: {
		tone: 'muted',
	},
});
