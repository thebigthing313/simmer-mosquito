import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { Children, isValidElement, type ReactNode } from 'react';

/**
 * The name above a filter control, for the controls that cannot carry their own.
 *
 * A segmented group is three option words in a row; without a name over them,
 * "All / Active / Inactive" does not say what it is filtering. A popover trigger
 * names itself, so it does not use this.
 */
export function FilterLabel({ children }: { readonly children: ReactNode }) {
	return <span className="font-semibold text-muted-foreground text-xs">{children}</span>;
}

/**
 * The two-up bed the popover filters sit in, with an odd last one spanning.
 *
 * Three filters in a two-column grid leave the third alone in a half-width cell
 * beside a hole, which reads as a layout that broke rather than one that was
 * chosen. Five of the explorers filter by exactly three things.
 */
export function FilterGrid({ children }: { readonly children: ReactNode }) {
	const items = Children.toArray(children).filter(isValidElement);
	const spansLast = items.length % 2 === 1;

	return (
		<div className="grid grid-cols-2 gap-2">
			{items.map((child, index) => (
				// `grid` rather than a bare div: a one-item grid stretches its child, so
				// the trigger fills the column without carrying a width of its own.
				<div
					className={cn('grid', spansLast && index === items.length - 1 && 'col-span-2')}
					key={child.key ?? index}
				>
					{child}
				</div>
			))}
		</div>
	);
}
