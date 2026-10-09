import { useDateRangeFilters } from '../../../hooks/explorer/use-date-range-filters';
import { DateRangeFilter } from '../../date-range-filter';
import { ActiveFilterBar, DateRangeChip, FilterChip, SegmentedFilter } from '../../explorer';
import type { ServiceRequestStatusFilter } from './legend';
import {
	SERVICE_REQUEST_ORDER_OPTIONS,
	type ServiceRequestFilters,
	type ServiceRequestRailOrder,
} from './service-requests-search';

/** The three filters the Table shares with the Map, read through the Map's codecs. */
export type ServiceRequestTableFilters = Pick<ServiceRequestFilters, 'status' | 'from' | 'to'>;

const STATUS_OPTIONS: readonly {
	readonly value: ServiceRequestStatusFilter;
	readonly label: string;
}[] = [
	{ value: 'all', label: 'All' },
	{ value: 'open', label: 'Open' },
	{ value: 'closed', label: 'Closed' },
];

/**
 * Status, the date window and the order, above the rows they narrow. It renders
 * whether or not any rows came back, because a filter that matched nothing is
 * when the reader needs the control that loosens it. The order narrows nothing,
 * so it is no chip and a reset leaves it alone.
 */
export function ServiceRequestsFilterBar({
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
	readonly defaults: ServiceRequestTableFilters;
	readonly filters: ServiceRequestTableFilters;
	readonly onClearAll: () => void;
	readonly onOrderChange: (order: ServiceRequestRailOrder) => void;
	readonly order: ServiceRequestRailOrder;
	readonly setFilters: (patch: Partial<ServiceRequestTableFilters>) => void;
	readonly today: string;
}) {
	const dateRange = useDateRangeFilters({ from: filters.from, to: filters.to, today, setFilters });
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
					<DateRangeChip defaults={defaults} range={filters} setRange={setFilters} />
				</ActiveFilterBar>
			)}
		</div>
	);
}
