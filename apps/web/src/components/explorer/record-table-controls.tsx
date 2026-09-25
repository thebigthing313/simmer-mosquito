/**
 * The two controls a windowed record table draws around its rows: a column
 * header that sorts, and the Load more button under the last row. Written for
 * the Inspections Table and shared with the Service Requests Table.
 */

import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { Spinner } from '@simmer-mosquito/ui-web/components/ui/spinner';
import { TableHead } from '@simmer-mosquito/ui-web/components/ui/table';
import { ChevronDownIcon, ChevronUpIcon } from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import type { TableSort } from '../../lib/table-sort';

/**
 * A column header that sorts, and says which way it is sorting.
 *
 * `aria-sort` on the cell is what a screen reader reads; the chevron is the same
 * fact for everyone else. An unsorted column keeps its chevron back until the
 * pointer or the focus ring is on it, so four headers do not all point
 * somewhere at once and only one of them is the answer.
 */
export function SortableHead<TKey extends string>({
	align = 'left',
	children,
	onSort,
	sort,
	sortKey,
}: {
	readonly align?: 'left' | 'right';
	readonly children: string;
	readonly onSort: (key: TKey) => void;
	readonly sort: TableSort<TKey>;
	readonly sortKey: TKey;
}) {
	const isSorted = sort.key === sortKey;
	const direction = isSorted ? sort.direction : 'desc';
	const DirectionIcon = direction === 'asc' ? ChevronUpIcon : ChevronDownIcon;
	return (
		<TableHead
			aria-sort={isSorted ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'}
			className={align === 'right' ? 'text-right' : undefined}
		>
			<Button
				className="group -mx-2 h-8 px-2 font-medium"
				onClick={() => onSort(sortKey)}
				size="sm"
				type="button"
				variant="ghost"
			>
				{children}
				<DirectionIcon
					aria-hidden="true"
					className={cn(
						'text-muted-foreground transition-opacity',
						isSorted ? null : 'opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100',
					)}
				/>
			</Button>
		</TableHead>
	);
}

/** Widens the window by one step. Disabled, with a spinner, while that read is out. */
export function LoadMore({
	isLoading,
	onLoadMore,
}: {
	readonly isLoading: boolean;
	readonly onLoadMore: () => void;
}) {
	return (
		<div className="flex justify-center">
			<Button disabled={isLoading} onClick={onLoadMore} type="button" variant="outline">
				{isLoading ? <Spinner /> : null}
				Load More
			</Button>
		</div>
	);
}
