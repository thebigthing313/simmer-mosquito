import { cva, type VariantProps } from 'class-variance-authority';

/**
 * The "← Back to …" link at the top of every record page.
 *
 * A class helper rather than a component, deliberately. TanStack Router types
 * `Link`'s `to` and `params` against the generated route tree, so a wrapper
 * that forwarded them would have to widen or re-declare that generic — trading
 * thirteen copies of a class string for the loss of the check that catches a
 * dead link at build time. `pageContainer` and `stickyHeader` are the same
 * shape for the same reason: the styling is shared, the element is not.
 */
export const backLink = cva(
	'inline-flex w-fit items-center gap-1.5 text-muted-foreground text-sm hover:text-foreground',
	{
		variants: {
			/** `button` adds the focus ring an `<a>` gets from the browser. */
			as: {
				link: '',
				button:
					'rounded-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
			},
		},
		defaultVariants: {
			as: 'link',
		},
	},
);

export type BackLinkVariants = VariantProps<typeof backLink>;
