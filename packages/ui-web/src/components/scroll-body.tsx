import { ScrollArea } from '@simmer-mosquito/ui-web/components/ui/scroll-area';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import type * as React from 'react';

/**
 * How a scroll body gets the height it scrolls within.
 *
 * - `{ cap }` caps the body at a CSS length, such as `'18rem'` or
 *   `'calc(90vh - 13rem)'`, and it scrolls past that.
 * - `'shrink'` is for a body inside a flex column whose parent caps the height
 *   with `max-h`, such as a dialog or a drawer: the body shrinks to what the
 *   header and footer leave. Add `flex-1` through `className` when the body
 *   should also grow into spare height.
 * - `'fill'` is for a body whose root already has a definite height, such as a
 *   split pane column, and whose content is itself a full-height flex column
 *   that scrolls a region of its own.
 *
 * Left out, the root's own `className` gives it a height, as a pane with
 * `min-h-0 flex-1` does.
 */
export type ScrollBodyHeight = { readonly cap: string } | 'shrink' | 'fill';

export type ScrollBodyProps = Omit<
	React.ComponentProps<typeof ScrollArea>,
	'type' | 'orientation' | 'children'
> & {
	readonly children?: React.ReactNode;
	readonly height?: ScrollBodyHeight | undefined;
	/**
	 * Reserve right padding for the bar, which draws over the content rather
	 * than beside it. On by default. Turn it off only when the content carries
	 * right padding of its own at least as wide as the bar.
	 */
	readonly gutter?: boolean | undefined;
};

/**
 * A vertical scroll region that draws the styled bar only when its content
 * overflows. It takes a height from `height`, reserves room for the bar
 * unless `gutter` is off, and passes everything else to `ScrollArea`.
 */
export function ScrollBody({
	height,
	gutter = true,
	className,
	style,
	children,
	...props
}: ScrollBodyProps) {
	const cap = typeof height === 'object' ? height.cap : undefined;
	return (
		<ScrollArea
			// The caller's class goes first so the rules below read as the part's own,
			// and a caller cannot drop one by passing a conflicting utility.
			className={cn(
				className,
				cap !== undefined && '[&>[data-slot=scroll-area-viewport]]:max-h-(--scroll-body-cap)',
				height === 'shrink' &&
					'flex min-h-0 flex-col [&>[data-slot=scroll-area-viewport]]:min-h-0 [&>[data-slot=scroll-area-viewport]]:flex-1',
				height === 'fill' && '[&>[data-slot=scroll-area-viewport]>div]:h-full',
				gutter && '[&>[data-slot=scroll-area-viewport]]:pr-3',
			)}
			style={
				cap === undefined ? style : ({ ...style, '--scroll-body-cap': cap } as React.CSSProperties)
			}
			type="auto"
			{...props}
		>
			{children}
		</ScrollArea>
	);
}
