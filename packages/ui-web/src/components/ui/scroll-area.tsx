import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { ScrollArea as ScrollAreaPrimitive } from 'radix-ui';
import type * as React from 'react';

function ScrollArea({
	className,
	children,
	...props
}: React.ComponentProps<typeof ScrollAreaPrimitive.Root>) {
	return (
		<ScrollAreaPrimitive.Root
			data-slot="scroll-area"
			className={cn('relative', className)}
			{...props}
		>
			<ScrollAreaPrimitive.Viewport
				data-slot="scroll-area-viewport"
				/*
				 * `[&>div]:block` overrides the `display: table` Radix wraps the content
				 * in. A table sizes to its widest row, so content that would otherwise
				 * truncate instead pushed the row wider than the viewport, and since the
				 * viewport is `overflow-x: hidden` the overflow was not scrollable at all.
				 * It was simply cut off: the result rails lost their status badge and
				 * their detail chevron off the right edge, on every explorer.
				 *
				 * The table earns its keep only for a viewport that scrolls sideways, and
				 * nothing here does. A future horizontal scroller re-enables it locally
				 * rather than reverting this.
				 */
				className="size-full rounded-[inherit] transition-[color,box-shadow] outline-none focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:outline-1 [&>div]:!block"
			>
				{children}
			</ScrollAreaPrimitive.Viewport>
			<ScrollBar />
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
