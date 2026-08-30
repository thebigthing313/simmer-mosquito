import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { ScrollArea } from '@simmer-mosquito/ui-web/components/ui/scroll-area';
import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
import { MapPinnedIcon, OctagonXIcon } from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { useVirtualizer } from '@tanstack/react-virtual';
import { type ReactNode, useState } from 'react';
import { RESULT_SKELETON_KEYS } from './result-skeleton';

/**
 * The result rail every explorer shows beside its map: placeholders while the
 * first page loads, a reason when nothing matches, then the results.
 *
 * Only the empty-state copy and the results themselves differ between
 * explorers. The skeleton stands in only for the *first* load — once there is
 * something on screen, a refetch leaves it there rather than flashing back to
 * placeholders, so panning the map does not blank the list under the cursor.
 *
 * A failed request is its own state. Without one the rail fell back to the
 * empty state and told a reader whose request had 500'd to loosen their
 * filters, which is advice that cannot work and hides an outage. With results
 * already on screen the failure is a strip above them instead, because they are
 * real data and blanking them loses more than it says.
 *
 * Emptiness is told to this component rather than counted here, because a
 * caller whose results are a tree or a grouped log has no row count to read it
 * off. See {@link ExplorerResults}.
 */
export function ResultList({
	isEmpty,
	isLoading,
	isError = false,
	onRetry,
	emptyTitle,
	emptyDescription,
	skeletonClassName = 'h-[60px]',
	children,
}: {
	/** There is nothing to show. Not "the request is still out". */
	readonly isEmpty: boolean;
	readonly isLoading: boolean;
	/** The request failed. Takes precedence over the empty state. */
	readonly isError?: boolean;
	/** Runs the request again. Omitted where nothing can retry in place. */
	readonly onRetry?: (() => void) | undefined;
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
	/** The rows, or the whole body a caller composed itself. */
	readonly children: ReactNode;
}) {
	if (isLoading && isEmpty) {
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

	if (isError && isEmpty) {
		return (
			<div
				className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center"
				role="alert"
			>
				<OctagonXIcon aria-hidden="true" className="size-7 text-destructive/70" />
				<p className="font-medium text-foreground text-sm">Could not load results</p>
				<p className="max-w-[34ch] text-muted-foreground text-sm">
					The request failed. Try again, or reload the page if it keeps failing.
				</p>
				{onRetry === undefined ? null : (
					<Button className="mt-1" onClick={onRetry} size="sm" variant="outline">
						Try again
					</Button>
				)}
			</div>
		);
	}

	if (isEmpty) {
		return (
			<div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
				<MapPinnedIcon aria-hidden="true" className="size-7 text-muted-foreground/60" />
				<p className="font-medium text-foreground text-sm">{emptyTitle}</p>
				<p className="max-w-[34ch] text-muted-foreground text-sm">{emptyDescription}</p>
			</div>
		);
	}

	return (
		<>
			{isError ? (
				// What is below is the last good answer, so it stays. This says so.
				<div
					className="flex items-center gap-2 border-destructive/20 border-b bg-destructive/8 px-3 py-2 text-xs"
					role="alert"
				>
					<OctagonXIcon aria-hidden="true" className="size-3.5 shrink-0 text-destructive/80" />
					<span className="text-foreground">
						Showing the last result. The latest request failed.
					</span>
					{onRetry === undefined ? null : (
						<Button
							className="ml-auto h-6 px-2 text-xs"
							onClick={onRetry}
							size="sm"
							variant="ghost"
						>
							Try again
						</Button>
					)}
				</div>
			) : null}
			{children}
		</>
	);
}

/**
 * The height a row is assumed to be until it has been measured.
 *
 * Only the first paint and the scrollbar's early guess ride on it: every row
 * that mounts reports its real height back, so a rail of stacked inspection
 * rows settles at its true length rather than this one. It matches the
 * one-line row the shortest explorers draw.
 */
const ESTIMATED_ROW_HEIGHT = 60;

/**
 * How many rows past each edge of the window stay mounted.
 *
 * Enough that a flick of the wheel lands on rows that are already there, and
 * few enough that the tab order does not become the list again.
 */
const ROW_OVERSCAN = 6;

/**
 * A flat list of rows, which is what thirteen of the fifteen explorers hand
 * over. Only the rows in view are mounted.
 *
 * A page is 50 records and a panel shows about a dozen, so rendering the whole
 * page spent React reconciliation on 38 rows nobody could see. That was a 55ms
 * long task on every viewport settle while the map was being dragged, and the
 * same drag with the rail collapsed had none.
 *
 * The keyboard is the better reason. Each row is three tab stops, a select
 * button and two links, so a full page put 150 of them between the rail and the
 * pager under it with nothing to skip past them. Mounting the window instead
 * leaves the reader tabbing through what they can see.
 *
 * `content-visibility: auto` was tried first and is not the fix. It skips
 * layout and paint for the off-screen rows, and the cost here is neither: the
 * long task survived it, and the unrendered rows taking their real size drifted
 * the scroll height by 19px.
 */
export function ResultRows<TRow>({
	rows,
	children,
}: {
	readonly rows: readonly TRow[];
	readonly children: (row: TRow) => ReactNode;
}) {
	/*
	 * State rather than a ref, because the virtualizer has to be told the
	 * viewport exists. Radix mounts it below this component, so the node is not
	 * there on the render that starts the virtualizer, and a plain ref would
	 * leave it measuring nothing until something else happened to re-render.
	 */
	const [viewport, setViewport] = useState<HTMLDivElement | null>(null);

	const virtualizer = useVirtualizer({
		count: rows.length,
		// The scrolling node is the Radix viewport, not the ScrollArea root. The
		// root never scrolls, so a virtualizer handed it reads an offset of zero
		// for the life of the page and the rows sit still under a moving list.
		getScrollElement: () => viewport,
		estimateSize: () => ESTIMATED_ROW_HEIGHT,
		overscan: ROW_OVERSCAN,
	});

	const virtualRows = virtualizer.getVirtualItems();

	return (
		/*
		 * `w-full` on the list, because the Radix viewport wraps its children in a
		 * `display: table` element that otherwise shrink-wraps to the widest row
		 * and stops every `truncate` in the rows from having a width to truncate
		 * against. `auto`, not the Radix default of `hover`: the rail is nearly
		 * always longer than its panel, and a reader who cannot see a scrollbar
		 * until they happen to move the pointer over the list has no sign there
		 * are more rows.
		 */
		<ScrollArea className="min-h-0 flex-1" type="auto" viewportRef={setViewport}>
			<ul className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
				{virtualRows.map((virtualRow) => {
					const row = rows[virtualRow.index];
					if (row === undefined) {
						return null;
					}
					return (
						<li
							className={cn(
								'absolute top-0 left-0 w-full',
								// The divider belongs to the row above it, and `divide-y` cannot
								// draw it: it skips the first child, and the first child here is
								// whichever row the window happens to start on rather than the
								// first record.
								virtualRow.index === 0 ? undefined : 'border-border/40 border-t',
							)}
							data-index={virtualRow.index}
							key={virtualRow.key}
							// Rows are not one height. A dated row with a life-stage strip is
							// twice a bare one, so each is measured where it stands rather
							// than assumed to match the estimate.
							ref={virtualizer.measureElement}
							style={{ transform: `translateY(${virtualRow.start}px)` }}
						>
							{children(row)}
						</li>
					);
				})}
			</ul>
		</ScrollArea>
	);
}

/**
 * A caller-composed body, for a panel whose records are not a flat list.
 *
 * A plain scroll container rather than the rows' ScrollArea: a tree and a
 * day-grouped log bring their own headers, sections and sticky bits, and the
 * Radix viewport's `display: table` wrapper sizes those to their widest child.
 */
export function ResultBody({ children }: { readonly children: ReactNode }) {
	return <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>;
}
