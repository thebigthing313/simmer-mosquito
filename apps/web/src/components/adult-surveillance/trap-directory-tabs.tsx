import { TabStrip, TabStripTab } from '@simmer-mosquito/ui-web/components/tab-strip';
import type { TabsList } from '@simmer-mosquito/ui-web/components/ui/tabs';
import type { ComponentProps } from 'react';

/**
 * The tab strips the directory is filtered by: collection methods on the left,
 * seasons on the right, each as long as the organization's data makes it. The
 * strip fills its half of the row.
 */
export function DirectoryTabsList({
	label,
	children,
}: {
	/** Names the strip for screen readers, "Collection method", "Season". */
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
