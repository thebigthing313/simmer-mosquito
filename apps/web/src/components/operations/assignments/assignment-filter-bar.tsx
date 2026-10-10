/**
 * The Assignments index's filters above the list: the date window, the
 * Assigned to and Status popovers, and a chip for whatever is set. The chip bar
 * draws while `activeCount` is above zero, which counts a window moved off the
 * schedule window as one filter, and the Dates chip writes `binding.defaults`
 * back. Takes the binding from `useAssignmentFilterState`, the assignee options
 * and the label an assignee chip reads.
 */

import { useDateRangeFilters } from '../../../hooks/explorer/use-date-range-filters';
import type { AssignmentFilters } from '../../../hooks/operations/use-assignment-filter-state';
import {
	ASSIGNMENT_STATUS_LABELS,
	ASSIGNMENT_STATUSES,
} from '../../../hooks/queries/assignment-view';
import type { FilterBinding } from '../../../lib/search-filters';
import { DateRangeFilter } from '../../date-range-filter';
import {
	ActiveFilterBar,
	DateRangeChip,
	FilterChip,
	type FilterOption,
	MultiSelectFilter,
	without,
} from '../../explorer';

const STATUS_OPTIONS: readonly FilterOption[] = ASSIGNMENT_STATUSES.map((status) => ({
	id: status,
	label: ASSIGNMENT_STATUS_LABELS[status],
}));

export function AssignmentFilterBar({
	binding,
	assigneeLabel,
	assigneeOptions,
}: {
	readonly binding: FilterBinding<AssignmentFilters>;
	readonly assigneeLabel: (id: string) => string;
	readonly assigneeOptions: readonly FilterOption[];
}) {
	const { filters, setFilters, reset, activeCount, defaults, today } = binding;
	const dateRange = useDateRangeFilters({
		from: filters.from,
		to: filters.to,
		today,
		setFilters,
		direction: 'schedule',
	});

	return (
		<>
			<DateRangeFilter {...dateRange} />

			<div className="flex flex-wrap gap-2">
				<MultiSelectFilter
					empty="No profiles"
					label="Assigned to"
					onChange={(next) => setFilters({ people: next })}
					options={assigneeOptions}
					selected={filters.people}
				/>
				<MultiSelectFilter
					empty="No statuses"
					label="Status"
					onChange={(next) =>
						setFilters({
							statuses: new Set(ASSIGNMENT_STATUSES.filter((status) => next.has(status))),
						})
					}
					options={STATUS_OPTIONS}
					selected={filters.statuses}
				/>
			</div>

			{activeCount > 0 ? (
				<ActiveFilterBar onClearAll={reset}>
					<DateRangeChip defaults={defaults} range={filters} setRange={setFilters} />
					{[...filters.people].map((id) => (
						<FilterChip
							key={id}
							label={assigneeLabel(id)}
							onRemove={() => setFilters({ people: without(filters.people, id) })}
						/>
					))}
					{[...filters.statuses].map((status) => (
						<FilterChip
							key={status}
							label={ASSIGNMENT_STATUS_LABELS[status]}
							onRemove={() => setFilters({ statuses: without(filters.statuses, status) })}
						/>
					))}
				</ActiveFilterBar>
			) : null}
		</>
	);
}
