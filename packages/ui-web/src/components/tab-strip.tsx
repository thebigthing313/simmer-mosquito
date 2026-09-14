import { TabsList, TabsTrigger } from '@simmer-mosquito/ui-web/components/ui/tabs';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import type { ComponentProps } from 'react';

/**
 * The product's tab strip: underlined tabs on no background, in one row that
 * runs off the side rather than wrapping.
 *
 * One strip, because the app had three. A card header drew tabs as a grey pill
 * bar, a directory drew them underlined, and a detail page drew a third thing,
 * so moving between two screens that list the same records looked like moving
 * between two products. The underline is the one that survived: it takes no
 * background, so it reads the same over a card, over a panel and inside a
 * header beside a button, and it is what the strips whose length is the
 * organization's own data already used.
 *
 * Three defaults are undone here, and each has been found the hard way.
 *
 * A wrapping strip collides with itself. `TabsTrigger` draws its active mark
 * five pixels *below* its own box, so the moment a second row exists that mark
 * lands inside it and the strip bleeds into whatever sits under it.
 *
 * A strip that scrolls sideways scrolls vertically too, unless it is told not
 * to. `overflow-x: auto` leaves the other axis at `auto` as well, and that same
 * five-pixel mark is five pixels of vertical overflow, so the browser draws a
 * vertical scrollbar inside a 36px-tall strip. That is invisible in review and
 * plain on screen: the habitat history card carried one for as long as it had
 * five tabs.
 *
 * And the scrolling happens on a wrapper rather than on the list itself,
 * because a `TabsList` is 36px tall by rule. A sideways scrollbar is drawn
 * inside its own box, so scrolling the list leaves 21px for a 30px tab and cuts
 * every one of them in half at exactly the width where the reader needed to
 * scroll. On the wrapper the bar sits under whole tabs. This is also why the
 * `h-auto` the trap directory used to carry never did anything: it loses to the
 * orientation variant that sets the height, and nothing said so.
 */
export function TabStrip({ className, ...props }: ComponentProps<typeof TabsList>) {
	return (
		<div
			className={cn(
				// Wide enough for the tabs and no wider, so a short strip reads as a
				// control rather than as a rule across the card. A caller whose strip
				// owns its row passes `w-full`.
				'w-fit max-w-full overflow-x-auto overflow-y-hidden',
				// Room under the row for the mark the trigger draws outside its box,
				// which `overflow-y-hidden` would otherwise cut off.
				'pb-1.5',
				className,
			)}
		>
			<TabsList className="w-max min-w-full flex-nowrap justify-start" variant="line" {...props} />
		</div>
	);
}

/** One tab in a {@link TabStrip}: its own width, and it keeps it. */
export function TabStripTab({ className, ...props }: ComponentProps<typeof TabsTrigger>) {
	return <TabsTrigger className={cn('shrink-0 grow-0', className)} {...props} />;
}
