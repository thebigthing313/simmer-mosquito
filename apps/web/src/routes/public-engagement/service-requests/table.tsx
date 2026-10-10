import { PageHeader } from '@simmer-mosquito/ui-web/components/page';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { createFileRoute } from '@tanstack/react-router';
import { OutletSimpleLayout } from '../../../components/app-shell';
import { RecordSetSwitch } from '../../../components/explorer/record-set-switch';
import { ExplorerPagination } from '../../../components/explorer-pagination';
import {
	SERVICE_REQUESTS_PATH,
	type ServiceRequestListing,
	serviceRequestPageParams,
	serviceRequestTileFilters,
} from '../../../components/public-engagement/service-requests/service-request-listing';
import {
	ServiceRequestsFilterBar,
	type ServiceRequestTableFilters,
} from '../../../components/public-engagement/service-requests/service-requests-filter-bar';
import {
	type ServiceRequestRailSearch,
	serviceRequestFilterCodecs,
	serviceRequestRailOrderCodecs,
	serviceRequestRecordSet,
} from '../../../components/public-engagement/service-requests/service-requests-search';
import { ServiceRequestsTable } from '../../../components/public-engagement/service-requests/service-requests-table';
import { RecordTableEmpty } from '../../../components/record/record-table-empty';
import { RecordTableUnavailable } from '../../../components/record/record-table-unavailable';
import {
	mapQueryParams,
	usePagedMapResource,
	WHOLE_WORLD_BBOX,
} from '../../../hooks/explorer/use-paged-map-resource';
import { useServiceRequestFilterDefaults } from '../../../hooks/public-engagement/use-service-request-filter-defaults';
import { useProfileNames } from '../../../hooks/queries/use-profile-names';
import { useRequestParties } from '../../../hooks/queries/use-request-parties';
import { useSearchFilters } from '../../../hooks/use-search-filters';
import { recordNoun } from '../../../lib/record-nouns';
import {
	DATE_RANGE_COUNTING,
	type FilterCodecs,
	searchValidator,
} from '../../../lib/search-filters';

const ORDER_DEFAULTS: ServiceRequestRailSearch = { order: 'newest' };

const FILTER_CODECS: FilterCodecs<ServiceRequestTableFilters> = {
	status: serviceRequestFilterCodecs.status,
	from: serviceRequestFilterCodecs.from,
	to: serviceRequestFilterCodecs.to,
};

export const Route = createFileRoute('/public-engagement/service-requests/table')({
	component: ServiceRequestsTableRoute,
	validateSearch: searchValidator({ ...FILTER_CODECS, ...serviceRequestRailOrderCodecs }),
});

const RequestIcon = iconRegistry.entities.serviceRequest.icon;

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
	const defaults: ServiceRequestTableFilters = {
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
	const routeSearch = Route.useSearch();

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
				actions={
					<RecordSetSwitch current="table" search={routeSearch} set={serviceRequestRecordSet} />
				}
				icon={RequestIcon}
				title={recordNoun('serviceRequest').titleMany}
			/>
			<ServiceRequestsFilterBar
				activeCount={activeCount}
				defaults={defaults}
				filters={query}
				onClearAll={reset}
				onOrderChange={(next) => setOrder({ order: next })}
				order={order.order}
				setFilters={setFilters}
				today={today}
			/>
			{isError ? <RecordTableUnavailable onRetry={retry} recordType="serviceRequest" /> : null}
			{rows.length === 0 ? (
				<RecordTableEmpty
					emptyDescription="Service requests received this year show here."
					filteredDescription="Nothing received matches what is set above."
					icon={RequestIcon}
					isError={isError}
					isFiltered={activeCount > 0}
					isLoading={isLoading}
					onClearFilters={reset}
					recordType="serviceRequest"
					scope={{ kind: 'thisYear' }}
				/>
			) : (
				<div className="grid gap-3">
					<ServiceRequestsTable
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
