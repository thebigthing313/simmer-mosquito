/**
 * The Requests for Control filter card: the date window, the Status segments,
 * the Control type and Requested by popovers, the Not yet assigned toggle, and
 * the chips that undo what is set. Takes the binding from
 * `useRequestForControlFilterState`, the requester options and the names a
 * requester chip reads.
 */

import { useDateRangeFilters } from '../../../hooks/explorer/use-date-range-filters';
import type {
	RequestFilterBinding,
	RequestStatusFilter,
} from '../../../hooks/operations/use-request-for-control-filter-state';
import { CONTROL_TYPES, controlTypeLabel } from '../../../hooks/queries/operations-view';
import { DateRangeFilter } from '../../date-range-filter';
import {
	ActiveFilterBar,
	DateRangeChip,
	FilterChip,
	FilterGrid,
	type FilterOption,
	MultiSelectFilter,
	SegmentedFilter,
	ToggleFilter,
	without,
} from '../../explorer';

const STATUS_OPTIONS: readonly { readonly value: RequestStatusFilter; readonly label: string }[] = [
	{ value: 'all', label: 'All' },
	{ value: 'open', label: 'Open' },
	{ value: 'resolved', label: 'Resolved' },
];

const CONTROL_TYPE_OPTIONS: readonly FilterOption[] = CONTROL_TYPES.map((controlType) => ({
	id: controlType,
	label: controlTypeLabel(controlType),
}));

export function RequestControlFilters({
	binding,
	nameById,
	personnelOptions,
}: {
	readonly binding: RequestFilterBinding;
	readonly nameById: ReadonlyMap<string, string>;
	readonly personnelOptions: readonly FilterOption[];
}) {
	const { filters, setFilters, today } = binding;
	const dateRange = useDateRangeFilters({ from: filters.from, to: filters.to, today, setFilters });

	return (
		<>
			<DateRangeFilter {...dateRange} />

			<SegmentedFilter
				label="Status"
				onChange={(next: RequestStatusFilter) => setFilters({ status: next })}
				options={STATUS_OPTIONS}
				value={filters.status}
			/>

			<FilterGrid>
				<MultiSelectFilter
					empty="No control types"
					label="Control type"
					onChange={(next) => setFilters({ types: next })}
					options={CONTROL_TYPE_OPTIONS}
					selected={filters.types}
				/>
				<MultiSelectFilter
					empty="No profiles"
					label="Requested by"
					onChange={(next) => setFilters({ people: next })}
					options={personnelOptions}
					selected={filters.people}
				/>
				<ToggleFilter
					label="Not yet assigned"
					onChange={(next) => setFilters({ unassigned: next })}
					value={filters.unassigned}
				/>
			</FilterGrid>

			<RequestControlChips binding={binding} nameById={nameById} />
		</>
	);
}

/**
 * What is currently narrowing the list, each chip removing its own filter.
 * Draws nothing while `activeCount` is zero, and the Dates chip writes
 * `binding.defaults` back.
 */
function RequestControlChips({
	binding,
	nameById,
}: {
	readonly binding: RequestFilterBinding;
	readonly nameById: ReadonlyMap<string, string>;
}) {
	const { filters, setFilters, reset, activeCount, defaults } = binding;
	if (activeCount === 0) {
		return null;
	}
	return (
		<ActiveFilterBar onClearAll={reset}>
			{filters.status === 'open' ? null : (
				<FilterChip
					label={`Status: ${filters.status === 'all' ? 'All' : 'Resolved'}`}
					onRemove={() => setFilters({ status: 'open' })}
				/>
			)}
			<DateRangeChip defaults={defaults} range={filters} setRange={setFilters} />
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
					label={nameById.get(id) ?? 'Unknown profile'}
					onRemove={() => setFilters({ people: without(filters.people, id) })}
				/>
			))}
			{filters.unassigned ? (
				<FilterChip label="Not yet assigned" onRemove={() => setFilters({ unassigned: false })} />
			) : null}
		</ActiveFilterBar>
	);
}
