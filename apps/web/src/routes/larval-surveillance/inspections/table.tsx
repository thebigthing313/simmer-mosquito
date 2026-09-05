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
import { DateRangeFilter } from '../../../components/date-range-filter';
import { EmptyValue } from '../../../components/empty-value';
import {
	MultiSelectFilter,
	SegmentedFilter,
	ToggleFilter,
	useDateRangeFilters,
} from '../../../components/explorer';
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
	inspectionWindowKey,
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
import {
	DensityFilter,
	INSPECTION_TABLE_COUNTING,
	type InspectionCatalogs,
	type InspectionFilterBinding,
	InspectionFilterChips,
	inspectionTableFilters,
	useInspectionCatalogs,
	useInspectionFilterState,
	WETNESS_OPTIONS,
} from '../-inspection-filters';
import { inspectionFilterCodecs } from '../-inspections-search';
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

const SORT_DEFAULTS: TableSearch = {
	sort: DEFAULT_INSPECTION_SORT.key,
	direction: DEFAULT_INSPECTION_SORT.direction,
};

const SORT_CODECS: FilterCodecs<TableSearch> = {
	sort: choiceParam(INSPECTION_SORT_KEYS, SORT_DEFAULTS.sort),
	direction: choiceParam(SORT_DIRECTIONS, SORT_DEFAULTS.direction),
};

/**
 * The sort's two params and the explorer's eight, validated as one set.
 *
 * `searchValidator` keeps what its codecs name and drops the rest, so the
 * filters have to be here or a link from the map would arrive with them stripped
 * before the page read them. `regions` is among them and no control here writes
 * it: the table has no region predicate, and carrying the param is what lets a
 * reader go Map to Table and back without losing their region selection.
 */
const SEARCH_CODECS = { ...inspectionFilterCodecs, ...SORT_CODECS };

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
 *
 * ## The filters are the map explorer's
 *
 * The bar above the rows reads and writes the params the explorer reads and
 * writes, through the same codecs, so a link built on one surface opens the same
 * set on the other. Six of the explorer's seven filters are here; Region is not,
 * and `InspectionTableFilters` in the read hook says why.
 */
function InspectionsTableRoute() {
	const { filters: sortSearch, setFilters: setSort } = useSearchFilters(SORT_DEFAULTS, SORT_CODECS);
	const sort: InspectionSort = useMemo(
		() => ({ key: sortSearch.sort, direction: sortSearch.direction }),
		[sortSearch.direction, sortSearch.sort],
	);

	// The filter set is the explorer's, read through the explorer's codecs, so
	// the two surfaces answer the same address. Both hooks patch the same search
	// params and neither touches the other's keys. `all-time` is where the two
	// part: this page says it holds every inspection, so an address with no dates
	// on it opens on every inspection.
	const binding = useInspectionFilterState(INSPECTION_TABLE_COUNTING, 'all-time');
	const catalogs = useInspectionCatalogs();
	const filters = useMemo(() => inspectionTableFilters(binding.state), [binding.state]);

	// A window belongs to the query that loaded it. A new sort reorders the whole
	// set and a new filter changes which rows are in it, so either one starts at
	// the first page rather than at row fifty of something else. The window is
	// stored against that query's key and read back through `limit`, so the reset
	// follows from the URL rather than from a click handler: a pasted link and
	// Back out of a record get it too. `limit` reads `WINDOW_STEP` on the render
	// that discards the window, so the read is never asked for a stale one.
	const windowKey = inspectionWindowKey(sort, filters);
	const [loaded, setLoaded] = useState({ limit: WINDOW_STEP, key: windowKey });
	const isLoadedWindow = loaded.key === windowKey;
	if (!isLoadedWindow) {
		setLoaded({ limit: WINDOW_STEP, key: windowKey });
	}
	const limit = isLoadedWindow ? loaded.limit : WINDOW_STEP;

	const { rows, isReady, isError } = useInspectionTable(sort, limit, filters);
	const shown = useHeldRows(rows, isReady, windowKey);

	const sortBy = useCallback(
		(key: InspectionSortKey) => {
			const next = nextSort(sort, key);
			setSort({ direction: next.direction, sort: next.key });
		},
		[setSort, sort],
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
			<InspectionsFilterBar binding={binding} catalogs={catalogs} />
			{shown.length === 0 ? (
				<NoRows
					isError={isError}
					isFiltered={binding.activeCount > 0}
					isReady={isReady}
					onClearFilters={binding.reset}
				/>
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

/**
 * The filters, above the rows they narrow.
 *
 * Six controls, each one a column of `inspections`, which is what lets Postgres
 * answer a narrowed table rather than the browser hide rows out of a window it
 * was already sent. `InspectionTableFilters` in the read hook carries the rest
 * of that, including why Region is not here.
 *
 * The bar renders whether or not any rows came back, because a filter that
 * matched nothing is exactly when the reader needs the control that loosens it.
 */
function InspectionsFilterBar({
	binding,
	catalogs,
}: {
	readonly binding: InspectionFilterBinding;
	readonly catalogs: InspectionCatalogs;
}) {
	const { activeCount, defaults, reset, set, setFilters, state, today } = binding;
	const dateRange = useDateRangeFilters({
		from: state.dateFrom,
		to: state.dateTo,
		today,
		setFilters,
	});
	const resetDates = useCallback(
		() => setFilters({ from: defaults.from, to: defaults.to }),
		[setFilters, defaults.from, defaults.to],
	);

	return (
		<div className="grid gap-4 rounded-md border border-border/50 bg-muted/20 p-4">
			<div className="grid gap-4 lg:grid-cols-2">
				<DateRangeFilter {...dateRange} />
				<div className="grid content-start gap-3">
					<SegmentedFilter
						label="Water"
						onChange={set.setWetness}
						options={WETNESS_OPTIONS}
						value={state.wetness}
					/>
					<DensityFilter onChange={set.setDensities} selected={state.densities} />
				</div>
			</div>
			<div className="flex flex-wrap items-center gap-2">
				<ToggleFilter
					label="Larvae found only"
					onChange={set.setPositiveOnly}
					value={state.positiveOnly}
				/>
				<MultiSelectFilter
					empty="No habitat types"
					label="Habitat type"
					onChange={set.setTypeIds}
					options={catalogs.habitatTypes}
					selected={state.typeIds}
				/>
				<MultiSelectFilter
					empty="No people"
					label="Inspector"
					onChange={set.setInspectorIds}
					options={catalogs.personnel}
					selected={state.inspectorIds}
				/>
			</div>
			{activeCount === 0 ? null : (
				<InspectionFilterChips
					catalogs={catalogs}
					defaults={defaults}
					onClearAll={reset}
					onResetDates={resetDates}
					set={set}
					state={state}
				/>
			)}
		</div>
	);
}

/**
 * Waiting, failed, filtered to nothing, or genuinely empty. Nothing on screen
 * tells them apart, and the last two ask for different things: one wants a
 * looser filter, the other wants a first inspection.
 */
function NoRows({
	isError,
	isFiltered,
	isReady,
	onClearFilters,
}: {
	readonly isError: boolean;
	readonly isFiltered: boolean;
	readonly isReady: boolean;
	readonly onClearFilters: () => void;
}) {
	if (isError) {
		return <InspectionsUnavailable />;
	}
	if (!isReady) {
		return <ListLoading rows={8} />;
	}
	if (isFiltered) {
		return (
			<ListEmpty
				action={
					<Button onClick={onClearFilters} type="button" variant="outline">
						Clear filters
					</Button>
				}
				description="Nothing recorded matches what is set above."
				icon={InspectionIcon}
				title="No inspections match"
			/>
		);
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
 * A new sort or a new filter is the case where it is not. The same rows in the
 * old order under a header that now says something else reads as a sort that did
 * nothing, and rows that do not match the filter just set read as a filter that
 * did nothing. So what is held is kept against the window key it was read under
 * and only handed back while that still matches. Under a new one the reader
 * waits on a skeleton instead.
 */
function useHeldRows(
	rows: readonly InspectionTableRow[],
	isReady: boolean,
	windowKey: string,
): readonly InspectionTableRow[] {
	const held = useRef({ rows, windowKey });
	if (isReady) {
		held.current = { rows, windowKey };
		return rows;
	}
	return held.current.windowKey === windowKey ? held.current.rows : NO_ROWS;
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
						<TableHead>Habitat</TableHead>
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
