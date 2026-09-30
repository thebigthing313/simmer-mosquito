import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { ScrollArea as ScrollAreaPrimitive } from 'radix-ui';
import type * as React from 'react';

function ScrollArea({
	className,
	children,
	viewportRef,
	orientation = 'vertical',
	...props
}: React.ComponentProps<typeof ScrollAreaPrimitive.Root> & {
	/**
	 * The node that actually scrolls, handed to a caller that has to read or
	 * drive the scroll itself.
	 *
	 * The root is not it. Radix puts the overflow on an inner viewport, so a
	 * caller measuring the root reads the padding box of an element that never
	 * scrolls: a virtualizer handed the root sees zero scroll offset forever and
	 * its rows sit still while the list moves under them.
	 */
	readonly viewportRef?: React.Ref<HTMLDivElement> | undefined;
	/**
	 * The axis the content scrolls along, and the one bar drawn for it.
	 *
	 * `horizontal` is for content wider than the viewport, such as a table with
	 * more columns than fit. It keeps the table-sized content wrapper the
	 * vertical default flattens, so the content can grow past the right edge
	 * and the bar has something to scroll.
	 */
	readonly orientation?: 'vertical' | 'horizontal' | undefined;
}) {
	return (
		<ScrollAreaPrimitive.Root
			data-slot="scroll-area"
			/*
			 * `min-w-0` in the horizontal mode: a flex or grid item is otherwise as
			 * wide as its content's min-content width, so content wider than the
			 * column would widen the column rather than scroll inside it.
			 */
			className={cn('relative', orientation === 'horizontal' && 'min-w-0', className)}
			{...props}
		>
			<ScrollAreaPrimitive.Viewport
				data-slot="scroll-area-viewport"
				ref={viewportRef}
				/*
				 * `[&>div]:block` overrides the `display: table` Radix wraps the content
				 * in. A table sizes to its widest row, so content that would otherwise
				 * truncate instead pushed the row wider than the viewport, and since the
				 * viewport is `overflow-x: hidden` the overflow was not scrollable at all.
				 * It was simply cut off: the result rails lost their status badge and
				 * their detail chevron off the right edge, on every explorer.
				 *
				 * The table earns its keep only for a viewport that scrolls sideways, so
				 * the horizontal mode leaves it alone: a block never grows wider than
				 * the viewport, and the bar would have nothing to scroll (#1258).
				 */
				className={cn(
					'size-full rounded-[inherit] transition-[color,box-shadow] outline-hidden focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:outline-1',
					orientation === 'vertical' && '[&>div]:!block',
				)}
			>
				{children}
			</ScrollAreaPrimitive.Viewport>
			<ScrollBar orientation={orientation} />
			<ScrollAreaPrimitive.Corner />
		</ScrollAreaPrimitive.Root>
	);
}

function ScrollBar({
	className,
	orientation = 'vertical',
	...props
}: React.ComponentProps<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>) {
	return (
		<ScrollAreaPrimitive.ScrollAreaScrollbar
			data-slot="scroll-area-scrollbar"
			orientation={orientation}
			className={cn(
				'flex touch-none p-px transition-colors select-none',
				orientation === 'vertical' && 'h-full w-2.5 border-l border-l-transparent',
				orientation === 'horizontal' && 'h-2.5 flex-col border-t border-t-transparent',
				className,
			)}
			{...props}
		>
			<ScrollAreaPrimitive.ScrollAreaThumb
				data-slot="scroll-area-thumb"
				className="relative flex-1 rounded-full bg-border"
			/>
		</ScrollAreaPrimitive.ScrollAreaScrollbar>
	);
}

export { ScrollArea, ScrollBar };
