import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { createFileRoute } from '@tanstack/react-router';
import { surfaceCodecs } from '../../../components/explorer/record-set';
import { RecordSetTablePage } from '../../../components/explorer/record-set-table-page';
import type { ServiceRequestListing } from '../../../components/public-engagement/service-requests/service-request-listing';
import { ServiceRequestsFilterBar } from '../../../components/public-engagement/service-requests/service-requests-filter-bar';
import { ServiceRequestsPageTable } from '../../../components/public-engagement/service-requests/service-requests-page-table';
import {
	type ServiceRequestRailSearch,
	serviceRequestOrderParams,
	serviceRequestOverdueCutoffFor,
	serviceRequestRailOrderCodecs,
	serviceRequestRecordSet,
} from '../../../components/public-engagement/service-requests/service-requests-search';
import { useRecordSetFilters } from '../../../hooks/explorer/use-record-set-filters';
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
					binding={binding}
					onOrderChange={(next) => setOrder({ order: next })}
					order={order.order}
				/>
			}
			icon={RequestIcon}
			params={serviceRequestOrderParams(order.order)}
			search={search}
			set={serviceRequestRecordSet}
			table={(rows: readonly ServiceRequestListing[]) => (
				<ServiceRequestsPageTable overdueCutoff={overdueCutoff} rows={rows} today={binding.today} />
			)}
		/>
	);
}
