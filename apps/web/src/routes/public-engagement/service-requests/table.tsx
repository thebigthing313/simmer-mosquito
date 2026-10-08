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
import { OutletSimpleLayout } from '../../../components/app-shell';
import { DateRangeFilter } from '../../../components/date-range-filter';
import { ActiveFilterBar, FilterChip, SegmentedFilter } from '../../../components/explorer';
import { ExplorerPagination } from '../../../components/explorer-pagination';
import {
	contactDisplayName,
	formatRequestAge,
	formatRequestDate,
	intakeTypeLabel,
	isServiceRequestOpen,
	serviceRequestTitle,
} from '../../../components/public-engagement/public-engagement-display';
import { RequestStatusBadge } from '../../../components/public-engagement/public-engagement-ui';
import type { ServiceRequestStatusFilter } from '../../../components/public-engagement/service-requests/legend';
import {
	SERVICE_REQUESTS_PATH,
	type ServiceRequestListing,
	serviceRequestPageParams,
	serviceRequestTileFilters,
} from '../../../components/public-engagement/service-requests/service-request-listing';
import { ServiceRequestSurfaceSwitch } from '../../../components/public-engagement/service-requests/service-request-surface-switch';
import {
	SERVICE_REQUEST_ORDER_OPTIONS,
	type ServiceRequestFilters,
	type ServiceRequestRailOrder,
	type ServiceRequestRailSearch,
	serviceRequestFilterCodecs,
	serviceRequestRailOrderCodecs,
	sharedServiceRequestSearch,
} from '../../../components/public-engagement/service-requests/service-requests-search';
import { ClampedTextCell, LinkedTableRow } from '../../../components/record/linked-table-row';
import { useDateRangeFilters } from '../../../hooks/explorer/use-date-range-filters';
import {
	mapQueryParams,
	usePagedMapResource,
	WHOLE_WORLD_BBOX,
} from '../../../hooks/explorer/use-paged-map-resource';
import { useServiceRequestFilterDefaults } from '../../../hooks/public-engagement/use-service-request-filter-defaults';
import type { Address } from '../../../hooks/queries/address-view';
import type { ContactSummary } from '../../../hooks/queries/contact-view';
import { useProfileNames } from '../../../hooks/queries/use-profile-names';
import { useRequestParties } from '../../../hooks/queries/use-request-parties';
import { useSearchFilters } from '../../../hooks/use-search-filters';
import { addressCardLabel } from '../../../lib/address-format';
import { dateRangeLabel } from '../../../lib/local-date';
import { recordNoun } from '../../../lib/record-nouns';
import {
	DATE_RANGE_COUNTING,
	type FilterCodecs,
	searchValidator,
} from '../../../lib/search-filters';

const ORDER_DEFAULTS: ServiceRequestRailSearch = { order: 'newest' };

/** The three filters the Table shares with the Map, read through the Map's codecs. */
type TableFilters = Pick<ServiceRequestFilters, 'status' | 'from' | 'to'>;

const FILTER_CODECS: FilterCodecs<TableFilters> = {
	status: serviceRequestFilterCodecs.status,
	from: serviceRequestFilterCodecs.from,
	to: serviceRequestFilterCodecs.to,
};

export const Route = createFileRoute('/public-engagement/service-requests/table')({
	component: ServiceRequestsTableRoute,
	validateSearch: searchValidator({ ...FILTER_CODECS, ...serviceRequestRailOrderCodecs }),
});

const RequestIcon = iconRegistry.entities.serviceRequest.icon;

const STATUS_OPTIONS: readonly {
	readonly value: ServiceRequestStatusFilter;
	readonly label: string;
}[] = [
	{ value: 'all', label: 'All' },
	{ value: 'open', label: 'Open' },
	{ value: 'closed', label: 'Closed' },
];

/**
 * Every service request as a table, a hundred to a page. It opens on the same
 * window the Map does, every request received this year, open or closed, and
 * newest first.
 *
 * The rows are a page of `/map/service-requests`, the endpoint the Map's rail
 * reads, over the whole world rather than a viewport. Postgres filters, orders
 * and counts. The order is the rail's too: newest or oldest request date first,
 * under the same `order` param, which stays on the surface that set it.
 * `docs/web-components.md` says why there are no column sorts and no Load more.
 */
function ServiceRequestsTableRoute() {
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
	const { filters: order, setFilters: setOrder } = useSearchFilters(
		ORDER_DEFAULTS,
		serviceRequestRailOrderCodecs,
	);

	// The switch to the Map carries the shared filters and leaves the order behind.
	const carried = sharedServiceRequestSearch(Route.useSearch());

	const params = mapQueryParams({
		bbox: WHOLE_WORLD_BBOX,
		...serviceRequestPageParams(serviceRequestTileFilters(query), order.order),
	});
	const { rows, total, isLoading, isError, retry, page, pageCount, setPage } =
		usePagedMapResource<ServiceRequestListing>({
			path: SERVICE_REQUESTS_PATH,
			rowsKey: 'serviceRequests',
			recordType: 'serviceRequest',
			params,
		});

	// The contact and the address resolve for the page alone, at most a hundred
	// ids, the way the Map's rail resolves them.
	const parties = useRequestParties(rows);
	const profileNames = useProfileNames();

	return (
		<OutletSimpleLayout className="grid content-start gap-5" measure="record">
			<PageHeader
				actions={<ServiceRequestSurfaceSwitch current="table" search={carried} />}
				icon={RequestIcon}
				title={recordNoun('serviceRequest').titleMany}
			/>
			<RequestsFilterBar
				activeCount={activeCount}
				defaults={defaults}
				filters={query}
				onClearAll={reset}
				onOrderChange={(next) => setOrder({ order: next })}
				order={order.order}
				setFilters={setFilters}
				today={today}
			/>
			{isError ? <RequestsUnavailable onRetry={retry} /> : null}
			{rows.length === 0 ? (
				<NoRows
					isError={isError}
					isFiltered={activeCount > 0}
					isLoading={isLoading}
					onClearFilters={reset}
				/>
			) : (
				<div className="grid gap-3">
					<RequestsTable
						addressById={parties.addressById}
						contactById={parties.contactById}
						profileNames={profileNames}
						rows={rows}
						today={today}
					/>
					<ExplorerPagination
						noun={recordNoun('serviceRequest')}
						onPageChange={setPage}
						page={page}
						pageCount={pageCount}
						total={total}
					/>
				</div>
			)}
		</OutletSimpleLayout>
	);
}

/**
 * Status, the date window and the order, above the rows they narrow. It renders
 * whether or not any rows came back, because a filter that matched nothing is
 * when the reader needs the control that loosens it. The order narrows nothing,
 * so it is no chip and a reset leaves it alone.
 */
function RequestsFilterBar({
	activeCount,
	defaults,
	filters,
	onClearAll,
	onOrderChange,
	order,
	setFilters,
	today,
}: {
	readonly activeCount: number;
	readonly defaults: TableFilters;
	readonly filters: TableFilters;
	readonly onClearAll: () => void;
	readonly onOrderChange: (order: ServiceRequestRailOrder) => void;
	readonly order: ServiceRequestRailOrder;
	readonly setFilters: (patch: Partial<TableFilters>) => void;
	readonly today: string;
}) {
	const dateRange = useDateRangeFilters({ from: filters.from, to: filters.to, today, setFilters });
	const isDateMoved = filters.from !== defaults.from || filters.to !== defaults.to;
	return (
		<div className="grid gap-4 rounded-md border border-border/50 bg-muted/20 p-4">
			<div className="grid gap-4 lg:grid-cols-2">
				<DateRangeFilter {...dateRange} />
				<div className="grid content-start gap-3">
					<SegmentedFilter
						label="Status"
						onChange={(status: ServiceRequestStatusFilter) => setFilters({ status })}
						options={STATUS_OPTIONS}
						value={filters.status}
					/>
					<SegmentedFilter
						label="Order"
						onChange={onOrderChange}
						options={SERVICE_REQUEST_ORDER_OPTIONS}
						value={order}
					/>
				</div>
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
 * Waiting, failed, filtered to nothing, or genuinely empty. A failure has its
 * own strip above, so here it draws nothing rather than a second one. The last
 * two ask for different things: one wants a looser filter, the other a first
 * request.
 */
function NoRows({
	isError,
	isFiltered,
	isLoading,
	onClearFilters,
}: {
	readonly isError: boolean;
	readonly isFiltered: boolean;
	readonly isLoading: boolean;
	readonly onClearFilters: () => void;
}) {
	if (isError) {
		return null;
	}
	if (isLoading) {
		return <ListLoading rows={8} />;
	}
	if (isFiltered) {
		return (
			<ListEmpty
				action={
					<Button onClick={onClearFilters} type="button" variant="outline">
						Clear Filters
					</Button>
				}
				description="Nothing received matches what is set above."
				icon={RequestIcon}
				title="No Service Requests Match"
			/>
		);
	}
	return (
		<ListEmpty
			description="Service requests received this year show here."
			icon={RequestIcon}
			title="No Service Requests This Year"
		/>
	);
}

function RequestsTable({
	addressById,
	contactById,
	profileNames,
	rows,
	today,
}: {
	readonly addressById: ReadonlyMap<string, Address>;
	readonly contactById: ReadonlyMap<string, ContactSummary>;
	readonly profileNames: ReadonlyMap<string, string>;
	readonly rows: readonly ServiceRequestListing[];
	readonly today: string;
}) {
	return (
		<div className="rounded-md border border-border/50">
			<Table>
				<TableHeader>
					<TableRow className="bg-muted/40 hover:bg-muted/40">
						<TableHead>Number</TableHead>
						<TableHead>Received</TableHead>
						<TableHead>Age</TableHead>
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
						<RequestRow
							address={addressById.get(row.addressId)}
							contact={contactById.get(row.contactId)}
							key={row.id}
							receivedByName={
								row.receivedByProfileId === null
									? null
									: (profileNames.get(row.receivedByProfileId) ?? null)
							}
							row={row}
							today={today}
						/>
					))}
				</TableBody>
			</Table>
		</div>
	);
}

function RequestRow({
	address,
	contact,
	receivedByName,
	row,
	today,
}: {
	readonly address: Address | undefined;
	readonly contact: ContactSummary | undefined;
	readonly receivedByName: string | null;
	readonly row: ServiceRequestListing;
	readonly today: string;
}) {
	const title = serviceRequestTitle(row);
	const addressLabel = addressCardLabel(address);
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
			{/* A closed request has stopped ageing, and Received already dates it. */}
			<TableCell className="tabular-nums">
				{isServiceRequestOpen(row) ? formatRequestAge(row.requestDate, today) : <AbsentValue />}
			</TableCell>
			<TableCell>
				<RequestStatusBadge open={row.closedAt === null} />
			</TableCell>
			<TableCell className="max-w-[14rem] truncate">
				{contact === undefined ? <AbsentValue /> : contactDisplayName(contact)}
			</TableCell>
			<TableCell
				className="max-w-[18rem] truncate text-muted-foreground"
				title={addressLabel ?? undefined}
			>
				{addressLabel ?? <AbsentValue />}
			</TableCell>
			<TableCell className="text-muted-foreground">{intakeTypeLabel(row.intakeType)}</TableCell>
			<TableCell className="text-muted-foreground">{receivedByName ?? <AbsentValue />}</TableCell>
			<ClampedTextCell empty={<AbsentValue />} text={details} />
		</LinkedTableRow>
	);
}

/** The read failed. Says so whether or not there are rows behind it. */
function RequestsUnavailable({ onRetry }: { readonly onRetry: () => void }) {
	return (
		<Alert variant="destructive">
			<AlertDescription className="flex flex-wrap items-center justify-between gap-2">
				Service requests could not be loaded.
				<Button onClick={onRetry} size="sm" type="button" variant="outline">
					Try Again
				</Button>
			</AlertDescription>
		</Alert>
	);
}
