import { TabsList, TabsTrigger } from '@simmer-mosquito/ui-web/components/ui/tabs';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import type { ComponentProps } from 'react';

/**
 * The tab strips the directory is filtered by: collection methods on the left,
 * seasons on the right. Both are as long as the organization's own data makes
 * them — an organization running six trap types, a trap collecting since 2014 —
 * so neither can be laid out as if it were three tabs.
 *
 * Two defaults have to be undone for that.
 *
 * A trigger grows to fill its list, so a strip of two reads as two half-pane
 * buttons rather than a filter. And a wrapping strip collides with itself: the
 * `line` variant draws its active mark five pixels *below* the trigger box, so
 * the moment a second row exists that mark lands inside it, and the strip bleeds
 * into whatever sits underneath.
 *
 * So the strip is one row that scrolls sideways, with room under it for the mark
 * it draws outside its own box. Height is then fixed no matter how many tabs
 * there are, which is the property the page below depends on.
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
		<TabsList
			aria-label={label}
			className="h-auto w-full max-w-full flex-nowrap justify-start overflow-x-auto overflow-y-hidden pb-1.5"
			variant="line"
		>
			{children}
		</TabsList>
	);
}

/** One tab in a {@link DirectoryTabsList}: its own width, and it stays there. */
export function DirectoryTab({
	className,
	...props
}: ComponentProps<typeof TabsTrigger>): React.JSX.Element {
	return <TabsTrigger className={cn('shrink-0 grow-0', className)} {...props} />;
}
