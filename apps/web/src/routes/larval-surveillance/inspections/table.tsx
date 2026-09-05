import { ListEmpty, ListLoading, PageHeader } from '@simmer-mosquito/ui-web/components/page';
import { Alert, AlertDescription } from '@simmer-mosquito/ui-web/components/ui/alert';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { Spinner } from '@simmer-mosquito/ui-web/components/ui/spinner';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@simmer-mosquito/ui-web/components/ui/table';
import {
	ChevronDownIcon,
	ChevronRightIcon,
	ChevronUpIcon,
	iconRegistry,
} from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { OutletSimpleLayout } from '../../../components/app-shell';
import { EmptyValue } from '../../../components/empty-value';
import { DensityBadge, LifeStageStrip, WetnessBadge } from '../../../components/larval-display';
import {
	type InspectionTableRow,
	inspectionSiteLabel,
	inspectionTypeLabel,
} from '../../../hooks/queries/larval-activity-view';
import {
	DEFAULT_INSPECTION_SORT,
	INSPECTION_SORT_KEYS,
	type InspectionSort,
	type InspectionSortKey,
	nextSort,
	SORT_DIRECTIONS,
	type SortDirection,
	useInspectionTable,
} from '../../../hooks/queries/use-inspection-table';
import {
	choiceParam,
	type FilterCodecs,
	searchValidator,
	useSearchFilters,
} from '../../../lib/search-filters';
import { formatListDate } from '../-overview-data';

/**
 * The sort lives in the URL, so a sorted table is a link somebody can send.
 *
 * The codecs leave the opening sort out of the address bar and drop anything
 * they do not recognise, which is what keeps a hand-edited URL from reaching the
 * read with no sort at all. `limit` with no `orderBy` throws where it renders.
 */
interface TableSearch {
	readonly sort: InspectionSortKey;
	readonly direction: SortDirection;
}

const SEARCH_DEFAULTS: TableSearch = {
	sort: DEFAULT_INSPECTION_SORT.key,
	direction: DEFAULT_INSPECTION_SORT.direction,
};

const SEARCH_CODECS: FilterCodecs<TableSearch> = {
	sort: choiceParam(INSPECTION_SORT_KEYS, SEARCH_DEFAULTS.sort),
	direction: choiceParam(SORT_DIRECTIONS, SEARCH_DEFAULTS.direction),
};

export const Route = createFileRoute('/larval-surveillance/inspections/table')({
	component: InspectionsTableRoute,
	validateSearch: searchValidator(SEARCH_CODECS),
});

const InspectionIcon = iconRegistry.entities.inspection.icon;

/** How many rows the page opens on, and how many each Load more adds. */
const WINDOW_STEP = 50;

/**
 * Every inspection as a table, newest first until the reader says otherwise.
 *
 * The map explorer beside this answers "where was work done"; this answers
 * "what has been recorded", which is a question about a run of rows rather than
 * about a place, so it spends no room on a map.
 *
 * ## Why there is no page count
 *
 * `inspections` is on-demand. A total would mean loading the whole set into the
 * browser to count it, which is the one thing the mode exists to avoid, so the
 * reader extends the window instead of stepping through numbered pages. The
 * order is Postgres's: the read sends `order_by` and `limit` with the shape
 * request, and Load more asks for a wider window rather than sorting a bigger
 * pile locally.
 *
 * A header sorts the whole set for the same reason, not the rows already down.
 * Four of the nine columns carry the control. `INSPECTION_SORT_KEYS` says which
 * four and why Site, Habitat type, Inspector and Density are not among them;
 * Life stages is six boolean columns drawn as one strip, so there is no column
 * under it to sort by at all.
 */
function InspectionsTableRoute() {
	const { filters, setFilters } = useSearchFilters(SEARCH_DEFAULTS, SEARCH_CODECS);
	const sort: InspectionSort = useMemo(
		() => ({ key: filters.sort, direction: filters.direction }),
		[filters.direction, filters.sort],
	);

	// A window belongs to the sort it was loaded under. The fiftieth row of one
	// order is nobody's row in another, so a new sort starts at the first page of
	// it. The window is stored against the sort that widened it and read back
	// through `limit`, so the reset follows from the URL rather than from the
	// click handler. Every way of arriving at a sort gets it, including a pasted
	// link and coming back to the table from a record.
	const [loaded, setLoaded] = useState({ limit: WINDOW_STEP, ...sort });
	const isLoadedSort = loaded.key === sort.key && loaded.direction === sort.direction;
	if (!isLoadedSort) {
		setLoaded({ limit: WINDOW_STEP, ...sort });
	}
	const limit = isLoadedSort ? loaded.limit : WINDOW_STEP;

	const { rows, isReady, isError } = useInspectionTable(sort, limit);
	const shown = useHeldRows(rows, isReady, sort);

	const sortBy = useCallback(
		(key: InspectionSortKey) => {
			const next = nextSort(sort, key);
			setFilters({ direction: next.direction, sort: next.key });
		},
		[setFilters, sort],
	);

	const loadMore = useCallback(() => {
		setLoaded((current) => ({ ...current, limit: current.limit + WINDOW_STEP }));
	}, []);

	return (
		<OutletSimpleLayout className="grid content-start gap-5">
			<PageHeader
				description="Every inspection your crews have recorded."
				icon={InspectionIcon}
				title="Inspections"
			/>
			{shown.length === 0 ? (
				<NoRows isError={isError} isReady={isReady} />
			) : (
				<LoadedRows
					isError={isError}
					isReady={isReady}
					limit={limit}
					onLoadMore={loadMore}
					onSort={sortBy}
					rows={shown}
					sort={sort}
				/>
			)}
		</OutletSimpleLayout>
	);
}

/** Waiting, failed, or genuinely empty. Nothing on screen tells them apart. */
function NoRows({ isError, isReady }: { readonly isError: boolean; readonly isReady: boolean }) {
	if (isError) {
		return <InspectionsUnavailable />;
	}
	if (!isReady) {
		return <ListLoading rows={8} />;
	}
	return (
		<ListEmpty
			description="Inspections show here as crews record them."
			icon={InspectionIcon}
			title="No inspections yet"
		/>
	);
}

/**
 * The table, and the control that widens the window under it.
 *
 * A full window is the only sign there is more, since nothing here counts the
 * whole set. So the control shows while the rows fill the window, and goes when
 * a wider one comes back short.
 *
 * A failed read is a strip above rows that are still real rather than a state
 * that replaces them. It also has to end the waiting: a query that errored never
 * reports ready, so reading "not ready" as "still loading" leaves Load more
 * disabled under a spinner that turns forever with nothing saying why.
 */
function LoadedRows({
	isError,
	isReady,
	limit,
	onLoadMore,
	onSort,
	rows,
	sort,
}: {
	readonly isError: boolean;
	readonly isReady: boolean;
	readonly limit: number;
	readonly onLoadMore: () => void;
	readonly onSort: (key: InspectionSortKey) => void;
	readonly rows: readonly InspectionTableRow[];
	readonly sort: InspectionSort;
}) {
	const isLoadingMore = !(isReady || isError);
	const hasMore = isLoadingMore || rows.length >= limit;
	return (
		<div className="grid gap-3">
			{isError ? <InspectionsUnavailable /> : null}
			<InspectionsTable onSort={onSort} rows={rows} sort={sort} />
			{hasMore ? <LoadMore isLoading={isLoadingMore} onLoadMore={onLoadMore} /> : null}
		</div>
	);
}

/** One array rather than a new empty one per render, which would re-render the table. */
const NO_ROWS: readonly InspectionTableRow[] = [];

/**
 * The rows on screen, held through the first read of a wider window.
 *
 * The live query is rebuilt when the limit changes, so it starts empty and
 * reports not-ready until the collection has answered. Rendering that as it
 * comes would take the table away from under the reader at the moment they
 * asked for more of it. What is already shown stays correct: the wider window
 * is the same order with more of it on the end.
 *
 * A new sort is the case where it is not. The same rows in the old order under a
 * header that now says something else reads as a sort that did nothing, so what
 * is held is kept with the sort it was read under and only handed back while
 * that still matches. Under a new one the reader waits on a skeleton instead.
 */
function useHeldRows(
	rows: readonly InspectionTableRow[],
	isReady: boolean,
	sort: InspectionSort,
): readonly InspectionTableRow[] {
	const held = useRef({ rows, sort });
	if (isReady) {
		held.current = { rows, sort };
		return rows;
	}
	const heldSort = held.current.sort;
	const isSameSort = heldSort.key === sort.key && heldSort.direction === sort.direction;
	return isSameSort ? held.current.rows : NO_ROWS;
}

function InspectionsTable({
	onSort,
	rows,
	sort,
}: {
	readonly onSort: (key: InspectionSortKey) => void;
	readonly rows: readonly InspectionTableRow[];
	readonly sort: InspectionSort;
}) {
	return (
		<div className="rounded-md border border-border/50">
			<Table>
				<TableHeader>
					<TableRow className="bg-muted/40 hover:bg-muted/40">
						<SortableHead onSort={onSort} sort={sort} sortKey="date">
							Date
						</SortableHead>
						<TableHead>Site</TableHead>
						<TableHead>Habitat type</TableHead>
						<TableHead>Inspector</TableHead>
						<SortableHead onSort={onSort} sort={sort} sortKey="water">
							Water
						</SortableHead>
						<TableHead>Density</TableHead>
						<SortableHead align="right" onSort={onSort} sort={sort} sortKey="dips">
							Dips
						</SortableHead>
						<TableHead>Life stages</TableHead>
						<SortableHead align="right" onSort={onSort} sort={sort} sortKey="larvae">
							Larvae
						</SortableHead>
						<TableHead className="w-[56px] text-right">
							<span className="sr-only">Actions</span>
						</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{rows.map((row) => (
						<InspectionRow key={row.id} row={row} />
					))}
				</TableBody>
			</Table>
		</div>
	);
}

/**
 * A column header that sorts, and says which way it is sorting.
 *
 * `aria-sort` on the cell is what a screen reader reads; the chevron is the same
 * fact for everyone else. An unsorted column keeps its chevron back until the
 * pointer or the focus ring is on it, so four headers do not all point
 * somewhere at once and only one of them is the answer.
 */
function SortableHead({
	align = 'left',
	children,
	onSort,
	sort,
	sortKey,
}: {
	readonly align?: 'left' | 'right';
	readonly children: string;
	readonly onSort: (key: InspectionSortKey) => void;
	readonly sort: InspectionSort;
	readonly sortKey: InspectionSortKey;
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

function InspectionRow({ row }: { readonly row: InspectionTableRow }) {
	const when = formatListDate(row.inspectionDate);
	const site = inspectionSiteLabel(row, row.address);
	return (
		<TableRow>
			<TableCell className="tabular-nums">{when}</TableCell>
			<TableCell className="max-w-[22rem] truncate font-medium" title={site}>
				{site}
			</TableCell>
			<TableCell className="text-muted-foreground">
				{inspectionTypeLabel(row) ?? <EmptyValue />}
			</TableCell>
			<TableCell className="text-muted-foreground">
				{row.inspectedByName ?? <EmptyValue />}
			</TableCell>
			<TableCell>
				<WetnessBadge isWet={row.isWet} />
			</TableCell>
			<TableCell>
				<DensityBadge density={row.density} />
			</TableCell>
			<TableCell className="text-right tabular-nums">{row.dipCount ?? <EmptyValue />}</TableCell>
			<TableCell>
				<LifeStageStrip size="sm" stages={row} />
			</TableCell>
			<TableCell className="text-right tabular-nums">{row.larvaeCount ?? <EmptyValue />}</TableCell>
			<TableCell className="text-right">
				<Button
					aria-label={`View the ${when} inspection of ${site}`}
					asChild
					size="icon-sm"
					variant="ghost"
				>
					<Link params={{ id: row.id }} to="/larval-surveillance/inspections/$id">
						<ChevronRightIcon aria-hidden="true" />
					</Link>
				</Button>
			</TableCell>
		</TableRow>
	);
}

function LoadMore({
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
				Load more
			</Button>
		</div>
	);
}

/** The read failed. Says so whether or not there are rows behind it. */
function InspectionsUnavailable() {
	return (
		<Alert variant="destructive">
			<AlertDescription>
				Inspections could not be loaded. Reload the page to try again.
			</AlertDescription>
		</Alert>
	);
}
