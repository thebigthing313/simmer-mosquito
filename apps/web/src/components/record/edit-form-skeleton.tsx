import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { keyedPlaceholders } from './skeleton-keys';

/**
 * One line of the form standing in: a Tailwind height for a full-width control,
 * or a list of heights for controls that share a row.
 */
export type EditFormSkeletonRow = string | readonly string[];

/**
 * A record form before its record arrives.
 *
 * Fifteen edit routes wrote this, eight of them character for character and the
 * rest differing only in how many bars stand in for fields. The frame that
 * matters is the outer one, and it was the same on all of them: the form column
 * on the left, the map filling the right half, and neither scrolling the page.
 *
 * The rows are the page's, because a placeholder that reserves four fields for a
 * form of two is a layout shift the moment the form loads.
 */
export function EditFormSkeleton({
	rows,
	frame = 'split',
	className,
}: {
	readonly rows: readonly EditFormSkeletonRow[];
	/**
	 * `split` is the geography forms, whose right half is a map. `pane` is a form
	 * with no map, which scrolls alone. `plain` is for a route that already sits
	 * inside a padded layout and supplies only the column.
	 */
	readonly frame?: 'split' | 'pane' | 'plain';
	/** Layout only, such as the measure a plain column sits in. */
	readonly className?: string;
}) {
	const column = (
		<>
			<Skeleton className="h-6 w-40" />
			{keyedPlaceholders(rows, 'row').map((row) => (
				<SkeletonRow key={row.key} row={row.value} />
			))}
		</>
	);

	if (frame === 'plain') {
		return <div className={cn('grid gap-5', className)}>{column}</div>;
	}
	if (frame === 'pane') {
		return (
			<div className={cn('grid h-full min-h-0 content-start gap-5 px-5 py-5', className)}>
				{column}
			</div>
		);
	}
	return (
		<div className="grid h-full min-h-0 w-full grid-cols-[2fr_3fr] overflow-hidden">
			<div className={cn('grid content-start gap-5 overflow-y-auto px-5 py-5', className)}>
				{column}
			</div>
			<Skeleton className="h-full w-full rounded-none border-border/40 border-l" />
		</div>
	);
}

function SkeletonRow({ row }: { readonly row: EditFormSkeletonRow }) {
	if (typeof row === 'string') {
		return <Skeleton className={`${row} w-full`} />;
	}
	return (
		<div className="grid grid-cols-2 gap-4">
			{keyedPlaceholders(row, 'field').map((field) => (
				<Skeleton className={`${field.value} w-full`} key={field.key} />
			))}
		</div>
	);
}
