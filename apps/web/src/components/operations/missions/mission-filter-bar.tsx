/**
 * The Missions index's filters above the list: the date window, the Status,
 * Control type and Assigned to popovers, and a chip for whatever is set. The
 * chip bar draws while `activeCount` is above zero, which counts a window moved
 * off the schedule window as one filter, and the Dates chip writes
 * `binding.defaults` back. Takes the binding from `useMissionFilterState`, the
 * assignee options and the label an assignee chip reads.
 */

import { useDateRangeFilters } from '../../../hooks/explorer/use-date-range-filters';
import type { MissionFilterBinding } from '../../../hooks/operations/use-mission-filter-state';
import {
	CONTROL_TYPES,
	controlTypeLabel,
	MISSION_STATUS_LABELS,
	MISSION_STATUSES,
} from '../../../hooks/queries/operations-view';
import { DateRangeFilter } from '../../date-range-filter';
import {
	ActiveFilterBar,
	DateRangeChip,
	FilterChip,
	type FilterOption,
	MultiSelectFilter,
	without,
} from '../../explorer';

const STATUS_OPTIONS: readonly FilterOption[] = MISSION_STATUSES.map((status) => ({
	id: status,
	label: MISSION_STATUS_LABELS[status],
}));

const CONTROL_TYPE_OPTIONS: readonly FilterOption[] = CONTROL_TYPES.map((controlType) => ({
	id: controlType,
	label: controlTypeLabel(controlType),
}));

export function MissionFilterBar({
	binding,
	assigneeLabel,
	assigneeOptions,
}: {
	readonly binding: MissionFilterBinding;
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
					empty="No statuses"
					label="Status"
					onChange={(next) =>
						setFilters({ statuses: new Set(MISSION_STATUSES.filter((status) => next.has(status))) })
					}
					options={STATUS_OPTIONS}
					selected={filters.statuses}
				/>
				<MultiSelectFilter
					empty="No control types"
					label="Control type"
					onChange={(next) => setFilters({ types: next })}
					options={CONTROL_TYPE_OPTIONS}
					selected={filters.types}
				/>
				<MultiSelectFilter
					empty="No profiles"
					label="Assigned to"
					onChange={(next) => setFilters({ people: next })}
					options={assigneeOptions}
					selected={filters.people}
				/>
			</div>

			{activeCount > 0 ? (
				<ActiveFilterBar onClearAll={reset}>
					<DateRangeChip defaults={defaults} range={filters} setRange={setFilters} />
					{[...filters.statuses].map((status) => (
						<FilterChip
							key={`status-${status}`}
							label={MISSION_STATUS_LABELS[status]}
							onRemove={() => setFilters({ statuses: without(filters.statuses, status) })}
						/>
					))}
					{[...filters.types].map((id) => (
						<FilterChip
							key={`type-${id}`}
							label={controlTypeLabel(id)}
							onRemove={() => setFilters({ types: without(filters.types, id) })}
						/>
					))}
					{[...filters.people].map((id) => (
						<FilterChip
							key={`person-${id}`}
							label={assigneeLabel(id)}
							onRemove={() => setFilters({ people: without(filters.people, id) })}
						/>
					))}
				</ActiveFilterBar>
			) : null}
		</>
	);
}
