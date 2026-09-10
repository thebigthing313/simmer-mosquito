import { TabStrip, TabStripTab } from '@simmer-mosquito/ui-web/components/tab-strip';
import type { TabsList } from '@simmer-mosquito/ui-web/components/ui/tabs';
import type { ComponentProps } from 'react';

/**
 * The tab strips the directory is filtered by: collection methods on the left,
 * seasons on the right. Both are as long as the organization's own data makes
 * them — an organization running six trap types, a trap collecting since 2014 —
 * so neither can be laid out as if it were three tabs.
 *
 * {@link TabStrip} is that strip. What is left here is this page's own: the
 * strip fills its half of the row, so a filter of two tabs does not read as two
 * half-pane buttons.
 */
export function DirectoryTabsList({
	label,
	children,
}: {
	/** Names the strip for screen readers — "Collection method", "Season". */
	readonly label: string;
	readonly children: ComponentProps<typeof TabsList>['children'];
}) {
	return (
		<TabStrip aria-label={label} className="w-full">
			{children}
		</TabStrip>
	);
}

/** One tab in a {@link DirectoryTabsList}. */
export const DirectoryTab = TabStripTab;
