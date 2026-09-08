import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import type { ReactNode } from 'react';

/**
 * The control that moves between two surfaces over one record set.
 *
 * ## The rule
 *
 * **Two surfaces that draw one record set and share a filter contract get a
 * switch, drawn on both of them.** The sidebar does not carry search: a
 * `ShellNavItem` names a typed `to` and nothing else, and TanStack Router drops
 * the search params on a navigation that names none, so a sidebar click lands on
 * the destination's defaults. That is correct for the sidebar, because a click
 * there is a move to a surface rather than a change of view, and a nav item that
 * carried params to a surface with no codec for them would build a link that
 * looks stateful and is not.
 *
 * A switch is the local answer instead. It sits on the two surfaces that
 * actually share the contract, it carries the shared params by construction
 * through a `Link`'s `search`, and it carries nothing else: params one surface
 * owns and the other does not read, such as a table's sort, stay behind. The
 * Inspections Map and Table are the pair this was written for (#521). When
 * another explorer grows a second surface, it gets one of these.
 *
 * ## What is here and what is the caller's
 *
 * The frame and the item styling, and nothing about destinations. `tsc` checks a
 * `to` and `search` pair against the generated route tree, and it can only do
 * that where the path is written as a literal, so each pair builds its own
 * `Link`s and this draws the box around them.
 */
export function SurfaceSwitch({
	children,
	label,
}: {
	readonly children: ReactNode;
	/** Names the group for a screen reader, e.g. `Inspections view`. */
	readonly label: string;
}) {
	return (
		// A `nav` rather than a labelled group: both segments are links to a place,
		// which is what a landmark is for, and it keeps the label on an element that
		// carries one natively.
		<nav
			aria-label={label}
			className="flex shrink-0 items-center gap-0.5 rounded-md border border-border/50 bg-muted/40 p-0.5"
		>
			{children}
		</nav>
	);
}

/**
 * One segment's classes: the surface being drawn, or the way to the other one.
 *
 * `compact` is the map frame, where the switch stands among icon-sized controls
 * in a 380px panel header and spells its destination on `aria-label` instead.
 * That is the division `CreateButton` in `explorer-header.tsx` already makes:
 * a page-width header has the room for the word and a panel header does not.
 */
export function surfaceSwitchItem({
	compact,
	isCurrent,
}: {
	readonly compact: boolean;
	readonly isCurrent: boolean;
}): string {
	return cn(
		'inline-flex items-center justify-center gap-1.5 rounded-sm font-medium text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
		compact ? 'size-7' : 'h-8 px-2.5',
		isCurrent
			? 'bg-background text-foreground shadow-sm'
			: 'text-muted-foreground hover:text-foreground',
	);
}
