import { ScrollArea } from '@simmer-mosquito/ui-web/components/ui/scroll-area';
import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
import { MapPinnedIcon } from '@simmer-mosquito/ui-web/icons/registry';
import type { ReactNode } from 'react';
import { RESULT_SKELETON_KEYS } from './result-skeleton';

/**
 * The result rail every explorer shows beside its map: placeholders while the
 * first page loads, a reason when nothing matches, then the rows.
 *
 * Only the empty-state copy and the row itself differ between explorers. The
 * skeleton stands in only for the *first* load — once rows exist, a refetch
 * leaves them on screen rather than flashing back to placeholders, so panning
 * the map does not blank the list under the cursor.
 */
export function ResultList<TRow>({
	rows,
	isLoading,
	emptyTitle,
	emptyDescription,
	skeletonClassName = 'h-[60px]',
	children,
}: {
	readonly rows: readonly TRow[];
	readonly isLoading: boolean;
	/** What is missing, e.g. `No traps match`. */
	readonly emptyTitle: string;
	/** What to change to find some. */
	readonly emptyDescription: string;
	/**
	 * The placeholder's height, matched to the row it stands in for so the list
	 * does not jump when results arrive. A literal class, because Tailwind's
	 * arbitrary values are compiled from source and a computed one would not
	 * exist in the stylesheet.
	 */
	readonly skeletonClassName?: string;
	readonly children: (row: TRow) => ReactNode;
}) {
	if (isLoading && rows.length === 0) {
		return (
			// The same ScrollArea the rows arrive into. A plain `overflow-y-auto` here
			// meant the panel wore the browser's scrollbar while it loaded and the
			// styled one once it had rows, so the rail shifted under the pointer at
			// the moment the reader was waiting on it.
			<ScrollArea className="min-h-0 flex-1" type="auto">
				<div className="grid gap-px p-2">
					{RESULT_SKELETON_KEYS.map((key) => (
						<Skeleton className={skeletonClassName} key={key} />
					))}
				</div>
			</ScrollArea>
		);
	}

	if (rows.length === 0) {
		return (
			<div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
				<MapPinnedIcon aria-hidden="true" className="size-7 text-muted-foreground/60" />
				<p className="font-medium text-foreground text-sm">{emptyTitle}</p>
				<p className="max-w-[34ch] text-muted-foreground text-sm">{emptyDescription}</p>
			</div>
		);
	}

	return (
		// `w-full` on the list, because the Radix viewport wraps its children in a
		// `display: table` element that otherwise shrink-wraps to the widest row and
		// stops every `truncate` in the rows from having a width to truncate against.
		// `auto`, not the Radix default of `hover`: the rail is nearly always longer
		// than its panel, and a reader who cannot see a scrollbar until they happen
		// to move the pointer over the list has no sign there are more rows.
		<ScrollArea className="min-h-0 flex-1" type="auto">
			<ul className="w-full divide-y divide-border/40">{rows.map(children)}</ul>
		</ScrollArea>
	);
}
