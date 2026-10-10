/**
 * The Requests for Control filter card: the date window, the Status segments,
 * the Control type and Requested by popovers, the Not yet assigned toggle, and
 * the chips that undo what is set, all drawn from
 * {@link requestControlFilterDeclarations}. Takes the binding from
 * `useRequestForControlFilterState`.
 */

import {
	type RequestFilters,
	requestFilterCodecs,
} from '../../../hooks/operations/use-request-for-control-filter-state';
import type { FilterBinding } from '../../../lib/search-filters';
import { FilterGrid } from '../../explorer';
import { DeclaredFilterChips, filterFields } from '../../explorer/declared-filters';
import { defineFilterDeclarations, TECHNICIAN_FILTER } from '../../explorer/filter-declarations';
import { CONTROL_TYPE_FILTER } from '../operations-filters';

/**
 * The Requests for Control filters, in the order their chips draw. Requested by
 * reads the profiles catalog the way a record set's Technician filter does, so
 * a profile the catalog does not hold is named the same on both.
 */
const requestControlFilterDeclarations = defineFilterDeclarations({ codecs: requestFilterCodecs }, [
	{
		kind: 'choice',
		key: 'status',
		label: 'Status',
		options: [
			{ value: 'all', label: 'All' },
			{ value: 'open', label: 'Open' },
			{ value: 'resolved', label: 'Resolved' },
		],
	},
	{ kind: 'dateRange' },
	CONTROL_TYPE_FILTER,
	{
		kind: 'idSet',
		key: 'people',
		label: 'Requested by',
		empty: 'No profiles',
		options: TECHNICIAN_FILTER.options,
		unknown: TECHNICIAN_FILTER.unknown,
	},
	{ kind: 'flag', key: 'unassigned', label: 'Not yet assigned' },
]);

export function RequestControlFilters({
	binding,
}: {
	readonly binding: FilterBinding<RequestFilters>;
}) {
	const fields = filterFields(requestControlFilterDeclarations, binding);
	return (
		<>
			{fields.dates}

			{fields.status}

			<FilterGrid>
				{fields.types}
				{fields.people}
				{fields.unassigned}
			</FilterGrid>

			<DeclaredFilterChips binding={binding} declarations={requestControlFilterDeclarations} />
		</>
	);
}
