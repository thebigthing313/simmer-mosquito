import type { RecordSetFilterBinding } from '../../../hooks/explorer/use-record-set-filters';
import { SegmentedFilter } from '../../explorer';
import { DeclaredFilterChips, filterFields } from '../../explorer/declared-filters';
import { serviceRequestFilterDeclarations } from './service-request-filters';
import {
	SERVICE_REQUEST_ORDER_OPTIONS,
	type ServiceRequestFilters,
	type ServiceRequestRailOrder,
} from './service-requests-search';

/**
 * Status, Overdue, the date window and the order, above the rows they narrow.
 * Overdue is drawn only while the Organization's threshold is on. It renders
 * whether or not any rows came back, because a filter that matched nothing is
 * when the reader needs the control that loosens it. The order narrows nothing,
 * so it is no chip and a reset leaves it alone. Takes the Table's binding from
 * `useRecordSetFilters`, and the order and its write.
 */
export function ServiceRequestsFilterBar({
	binding,
	onOrderChange,
	order,
}: {
	readonly binding: RecordSetFilterBinding<ServiceRequestFilters>;
	readonly onOrderChange: (order: ServiceRequestRailOrder) => void;
	readonly order: ServiceRequestRailOrder;
}) {
	const fields = filterFields(serviceRequestFilterDeclarations, binding);
	return (
		<>
			<div className="grid gap-4 lg:grid-cols-2">
				{fields.dates}
				<div className="grid content-start gap-3">
					{fields.status}
					{fields.overdue === null ? null : <div>{fields.overdue}</div>}
					<SegmentedFilter
						label="Order"
						onChange={onOrderChange}
						options={SERVICE_REQUEST_ORDER_OPTIONS}
						value={order}
					/>
				</div>
			</div>
			<DeclaredFilterChips binding={binding} declarations={serviceRequestFilterDeclarations} />
		</>
	);
}
