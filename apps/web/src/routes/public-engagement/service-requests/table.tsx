import { AbsentValue } from '@simmer-mosquito/ui-web/components/absent-value';
import { ListEmpty, ListLoading, PageHeader } from '@simmer-mosquito/ui-web/components/page';
import { Alert, AlertDescription } from '@simmer-mosquito/ui-web/components/ui/alert';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@simmer-mosquito/ui-web/components/ui/table';
import { ChevronRightIcon, iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useState } from 'react';
import { OutletSimpleLayout } from '../../../components/app-shell';
import { DateRangeFilter } from '../../../components/date-range-filter';
import {
	ActiveFilterBar,
	FilterChip,
	LoadMore,
	SegmentedFilter,
	SortableHead,
} from '../../../components/explorer';
import {
	contactDisplayName,
	formatRequestDate,
	intakeTypeLabel,
	serviceRequestTitle,
} from '../../../components/public-engagement/public-engagement-display';
import { RequestStatusBadge } from '../../../components/public-engagement/public-engagement-ui';
import type { StatusFilter } from '../../../components/public-engagement/service-requests/legend';
import { ServiceRequestSurfaceSwitch } from '../../../components/public-engagement/service-requests/service-request-surface-switch';
import {
	type ServiceRequestFilters,
	serviceRequestFilterCodecs,
	sharedServiceRequestSearch,
} from '../../../components/public-engagement/service-requests/service-requests-search';
import { ClampedTextCell, LinkedTableRow } from '../../../components/record/linked-table-row';
import { useDateRangeFilters } from '../../../hooks/explorer/use-date-range-filters';
import { useHeldRows } from '../../../hooks/explorer/use-held-rows';
import { useServiceRequestFilterDefaults } from '../../../hooks/public-engagement/use-service-request-filter-defaults';
import { resolveLinkedAddress } from '../../../hooks/queries/address-view';
import { resolveLinkedContact } from '../../../hooks/queries/contact-view';
import {
	DEFAULT_SERVICE_REQUEST_SORT,
	SERVICE_REQUEST_SORT_KEYS,
	type ServiceRequestSort,
	type ServiceRequestSortKey,
	type ServiceRequestTableFilters,
	type ServiceRequestTableRow,
	serviceRequestWindowKey,
	useServiceRequestTable,
} from '../../../hooks/queries/use-service-request-table';
import { useSearchFilters } from '../../../hooks/use-search-filters';
import { addressCardLabel } from '../../../lib/address-format';
import { dateRangeLabel } from '../../../lib/local-date';
import { recordNoun } from '../../../lib/record-nouns';
import {
	choiceParam,
	DATE_RANGE_COUNTING,
	type FilterCodecs,
	searchValidator,
} from '../../../lib/search-filters';
import { nextSort, SORT_DIRECTIONS, type SortDirection } from '../../../lib/table-sort';

/**
 * The sort lives in the URL, so a sorted table is a link somebody can send.
 * The codecs leave the opening sort out of the address bar and drop anything
 * they do not recognise.
 */
interface TableSearch {
	readonly sort: ServiceRequestSortKey;
	readonly direction: SortDirection;
}

const SORT_DEFAULTS: TableSearch = {
	sort: DEFAULT_SERVICE_REQUEST_SORT.key,
	direction: DEFAULT_SERVICE_REQUEST_SORT.direction,
};

const SORT_CODECS: FilterCodecs<TableSearch> = {
	sort: choiceParam(SERVICE_REQUEST_SORT_KEYS, SORT_DEFAULTS.sort),
	direction: choiceParam(SORT_DIRECTIONS, SORT_DEFAULTS.direction),
};

/** The three filters the Table shares with the Map, read through the Map's codecs. */
type TableFilters = Pick<ServiceRequestFilters, 'status' | 'from' | 'to'>;

const FILTER_CODECS: FilterCodecs<TableFilters> = {
	status: serviceRequestFilterCodecs.status,
	from: serviceRequestFilterCodecs.from,
	to: serviceRequestFilterCodecs.to,
};

export const Route = createFileRoute('/public-engagement/service-requests/table')({
	component: ServiceRequestsTableRoute,
	validateSearch: searchValidator({ ...FILTER_CODECS, ...SORT_CODECS }),
});

const RequestIcon = iconRegistry.entities.serviceRequest.icon;

const STATUS_OPTIONS: readonly { readonly value: StatusFilter; readonly label: string }[] = [
	{ value: 'all', label: 'All' },
	{ value: 'open', label: 'Open' },
	{ value: 'closed', label: 'Closed' },
];

/** How many rows the page opens on, and how many each Load more adds. */
const WINDOW_STEP = 50;

/**
 * Every service request as a table, newest first until the reader says
 * otherwise. It opens on the same window the Map does, every request received
 * this year, open or closed.
 *
 * `service_requests` is on-demand, so there is no page count: a total would load
 * the whole set into the browser to count it. The reader extends the window
 * instead, and Postgres does the ordering. The Inspections Table is the pattern
 * this follows, and its route carries the rest of the reasoning.
 */
function ServiceRequestsTableRoute() {
	const { filters: sortSearch, setFilters: setSort } = useSearchFilters(SORT_DEFAULTS, SORT_CODECS);
	const sort: ServiceRequestSort = { key: sortSearch.sort, direction: sortSearch.direction };

	const { defaults: mapDefaults, today } = useServiceRequestFilterDefaults();
	const defaults: TableFilters = {
		status: mapDefaults.status,
		from: mapDefaults.from,
		to: mapDefaults.to,
	};
	const {
		filters: query,
		setFilters,
		reset,
		activeCount,
	} = useSearchFilters(defaults, FILTER_CODECS, DATE_RANGE_COUNTING);
	const filters: ServiceRequestTableFilters = {
		isOpen: query.status === 'all' ? null : query.status === 'open',
		dateFrom: query.from,
		dateTo: query.to,
	};

	// A window belongs to the query that loaded it, so a new sort or a new filter
	// starts again at the first step. `InspectionsTableRoute` says why the reset
	// follows from the URL rather than from a click handler.
	const windowKey = serviceRequestWindowKey(sort, filters);
	const [loaded, setLoaded] = useState({ limit: WINDOW_STEP, key: windowKey });
	const isLoadedWindow = loaded.key === windowKey;
	if (!isLoadedWindow) {
		setLoaded({ limit: WINDOW_STEP, key: windowKey });
	}
	const limit = isLoadedWindow ? loaded.limit : WINDOW_STEP;

	// The switch to the Map carries the shared filters and leaves the sort behind.
	const carried = sharedServiceRequestSearch(Route.useSearch());

	const { rows, isReady, isError } = useServiceRequestTable(sort, limit, filters);
	const shown = useHeldRows(rows, isReady, windowKey);

	const sortBy = (key: ServiceRequestSortKey) => {
		const next = nextSort(sort, key);
		setSort({ direction: next.direction, sort: next.key });
	};

	const loadMore = () => {
		setLoaded((current) => ({ ...current, limit: current.limit + WINDOW_STEP }));
	};

	return (
		<OutletSimpleLayout className="grid content-start gap-5" measure="record">
			<PageHeader
				actions={<ServiceRequestSurfaceSwitch current="table" search={carried} />}
				description="Every service request received from the public."
				icon={RequestIcon}
				title={recordNoun('serviceRequest').titleMany}
			/>
			<RequestsFilterBar
				activeCount={activeCount}
				defaults={defaults}
				filters={query}
				onClearAll={reset}
				setFilters={setFilters}
				today={today}
			/>
			{shown.length === 0 ? (
				<NoRows
					isError={isError}
					isFiltered={activeCount > 0}
					isReady={isReady}
					onClearFilters={reset}
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
 * Status and the date window, above the rows they narrow. It renders whether or
 * not any rows came back, because a filter that matched nothing is when the
 * reader needs the control that loosens it.
 */
function RequestsFilterBar({
	activeCount,
	defaults,
	filters,
	onClearAll,
	setFilters,
	today,
}: {
	readonly activeCount: number;
	readonly defaults: TableFilters;
	readonly filters: TableFilters;
	readonly onClearAll: () => void;
	readonly setFilters: (patch: Partial<TableFilters>) => void;
	readonly today: string;
}) {
	const dateRange = useDateRangeFilters({ from: filters.from, to: filters.to, today, setFilters });
	const isDateMoved = filters.from !== defaults.from || filters.to !== defaults.to;
	return (
		<div className="grid gap-4 rounded-md border border-border/50 bg-muted/20 p-4">
			<div className="grid gap-4 lg:grid-cols-2">
				<DateRangeFilter {...dateRange} />
				<SegmentedFilter
					label="Status"
					onChange={(status: StatusFilter) => setFilters({ status })}
					options={STATUS_OPTIONS}
					value={filters.status}
				/>
			</div>
			{activeCount === 0 ? null : (
				<ActiveFilterBar onClearAll={onClearAll}>
					{filters.status === 'all' ? null : (
						<FilterChip
							label={`Status: ${filters.status === 'open' ? 'Open' : 'Closed'}`}
							onRemove={() => setFilters({ status: 'all' })}
						/>
					)}
					{isDateMoved ? (
						<FilterChip
							label={`Dates: ${dateRangeLabel(filters.from, filters.to)}`}
							onRemove={() => setFilters({ from: defaults.from, to: defaults.to })}
						/>
					) : null}
				</ActiveFilterBar>
			)}
		</div>
	);
}

/**
 * Waiting, failed, filtered to nothing, or genuinely empty. The last two ask
 * for different things: one wants a looser filter, the other a first request.
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
		return <RequestsUnavailable />;
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
				description="Nothing received matches what is set above."
				icon={RequestIcon}
				title="No service requests match"
			/>
		);
	}
	return (
		<ListEmpty
			description="Service requests received this year show here."
			icon={RequestIcon}
			title="No service requests this year"
		/>
	);
}

/**
 * The table, and the control that widens the window under it. A full window is
 * the only sign there is more, and a failed read is a strip above rows that are
 * still real. `LoadedRows` on the Inspections Table carries both reasons.
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
	readonly onSort: (key: ServiceRequestSortKey) => void;
	readonly rows: readonly ServiceRequestTableRow[];
	readonly sort: ServiceRequestSort;
}) {
	const isLoadingMore = !(isReady || isError);
	const hasMore = isLoadingMore || rows.length >= limit;
	return (
		<div className="grid gap-3">
			{isError ? <RequestsUnavailable /> : null}
			<RequestsTable onSort={onSort} rows={rows} sort={sort} />
			{hasMore ? <LoadMore isLoading={isLoadingMore} onLoadMore={onLoadMore} /> : null}
		</div>
	);
}

function RequestsTable({
	onSort,
	rows,
	sort,
}: {
	readonly onSort: (key: ServiceRequestSortKey) => void;
	readonly rows: readonly ServiceRequestTableRow[];
	readonly sort: ServiceRequestSort;
}) {
	return (
		<div className="rounded-md border border-border/50">
			<Table>
				<TableHeader>
					<TableRow className="bg-muted/40 hover:bg-muted/40">
						<SortableHead onSort={onSort} sort={sort} sortKey="number">
							Number
						</SortableHead>
						<SortableHead onSort={onSort} sort={sort} sortKey="date">
							Received
						</SortableHead>
						<TableHead>Status</TableHead>
						<TableHead>Contact</TableHead>
						<TableHead>Address</TableHead>
						<TableHead>Intake</TableHead>
						<TableHead>Received by</TableHead>
						<TableHead>Details</TableHead>
						<TableHead className="w-[56px] text-right">
							<span className="sr-only">Actions</span>
						</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{rows.map((row) => (
						<RequestRow key={row.id} row={row} />
					))}
				</TableBody>
			</Table>
		</div>
	);
}

function RequestRow({ row }: { readonly row: ServiceRequestTableRow }) {
	const title = serviceRequestTitle(row);
	const contact = resolveLinkedContact(row.contact);
	const address = addressCardLabel(resolveLinkedAddress(row.address));
	const details = row.details.trim();
	return (
		<LinkedTableRow
			action={
				<Button aria-label={`View ${title}`} asChild size="icon-sm" variant="ghost">
					<Link
						params={{ id: row.id }}
						state={{ breadcrumbVia: '/public-engagement/service-requests/table' }}
						to="/public-engagement/service-requests/$id"
					>
						<ChevronRightIcon aria-hidden="true" />
					</Link>
				</Button>
			}
		>
			<TableCell className="font-medium tabular-nums">{title}</TableCell>
			<TableCell className="tabular-nums">{formatRequestDate(row.requestDate)}</TableCell>
			<TableCell>
				<RequestStatusBadge open={row.closedAt === null} />
			</TableCell>
			<TableCell className="max-w-[14rem] truncate">
				{contact === undefined ? <AbsentValue /> : contactDisplayName(contact)}
			</TableCell>
			<TableCell
				className="max-w-[18rem] truncate text-muted-foreground"
				title={address ?? undefined}
			>
				{address ?? <AbsentValue />}
			</TableCell>
			<TableCell className="text-muted-foreground">{intakeTypeLabel(row.intakeType)}</TableCell>
			<TableCell className="text-muted-foreground">
				{row.receivedByName ?? <AbsentValue />}
			</TableCell>
			<ClampedTextCell empty={<AbsentValue />} text={details} />
		</LinkedTableRow>
	);
}

/** The read failed. Says so whether or not there are rows behind it. */
function RequestsUnavailable() {
	return (
		<Alert variant="destructive">
			<AlertDescription>
				Service requests could not be loaded. Reload the page to try again.
			</AlertDescription>
		</Alert>
	);
}
