import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { createFileRoute } from '@tanstack/react-router';
import { surfaceCodecs } from '../../../components/explorer/record-set';
import { RecordSetTablePage } from '../../../components/explorer/record-set-table-page';
import type { ServiceRequestListing } from '../../../components/public-engagement/service-requests/service-request-listing';
import { ServiceRequestsFilterBar } from '../../../components/public-engagement/service-requests/service-requests-filter-bar';
import {
	type ServiceRequestRailSearch,
	serviceRequestOrderParams,
	serviceRequestOverdueCutoffFor,
	serviceRequestRailOrderCodecs,
	serviceRequestRecordSet,
} from '../../../components/public-engagement/service-requests/service-requests-search';
import { ServiceRequestsTable } from '../../../components/public-engagement/service-requests/service-requests-table';
import { useRecordSetFilters } from '../../../hooks/explorer/use-record-set-filters';
import { useProfileNames } from '../../../hooks/queries/use-profile-names';
import { useRequestParties } from '../../../hooks/queries/use-request-parties';
import { useSearchFilters } from '../../../hooks/use-search-filters';
import { searchValidator } from '../../../lib/search-filters';

const ORDER_DEFAULTS: ServiceRequestRailSearch = { order: 'newest' };

export const Route = createFileRoute('/public-engagement/service-requests/table')({
	component: ServiceRequestsTableRoute,
	validateSearch: searchValidator({
		...surfaceCodecs(serviceRequestRecordSet, 'table'),
		...serviceRequestRailOrderCodecs,
	}),
});

const RequestIcon = iconRegistry.entities.serviceRequest.icon;

/**
 * Every service request as a table, a hundred to a page. It opens on the same
 * window the Map does, every request received this year, open or closed, and
 * newest first. The order is the rail's too, newest or oldest request date
 * first, under the same `order` param, which stays on the surface that set it.
 */
function ServiceRequestsTableRoute() {
	const binding = useRecordSetFilters(serviceRequestRecordSet, 'table');
	const { filters: order, setFilters: setOrder } = useSearchFilters(
		ORDER_DEFAULTS,
		serviceRequestRailOrderCodecs,
	);
	const overdueCutoff = serviceRequestOverdueCutoffFor(binding.context);
	const search = Route.useSearch();
	return (
		<RecordSetTablePage
			binding={binding}
			empty={{
				emptyDescription: 'Service requests received this year show here.',
				filteredDescription: 'Nothing received matches what is set above.',
				scope: { kind: 'thisYear' },
			}}
			filters={
				<ServiceRequestsFilterBar
					activeCount={binding.activeCount}
					defaults={binding.defaults}
					filters={binding.filters}
					onClearAll={binding.reset}
					onOrderChange={(next) => setOrder({ order: next })}
					order={order.order}
					overdueAvailable={overdueCutoff !== null}
					setFilters={binding.setFilters}
					today={binding.today}
				/>
			}
			icon={RequestIcon}
			params={serviceRequestOrderParams(order.order)}
			search={search}
			set={serviceRequestRecordSet}
			table={(rows: readonly ServiceRequestListing[]) => (
				<ServiceRequestRows overdueCutoff={overdueCutoff} rows={rows} today={binding.today} />
			)}
		/>
	);
}

/**
 * The page's rows, with the contact and the address resolved for the page
 * alone, at most a hundred ids, the way the Map's rail resolves them.
 */
function ServiceRequestRows({
	overdueCutoff,
	rows,
	today,
}: {
	readonly overdueCutoff: string | null;
	readonly rows: readonly ServiceRequestListing[];
	readonly today: string;
}) {
	const parties = useRequestParties(rows);
	const profileNames = useProfileNames();
	return (
		<ServiceRequestsTable
			addressById={parties.addressById}
			contactById={parties.contactById}
			overdueCutoff={overdueCutoff}
			profileNames={profileNames}
			rows={rows}
			today={today}
		/>
	);
}
