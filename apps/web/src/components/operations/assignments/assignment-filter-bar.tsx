/**
 * The Assignments index's filters above the list: the date window, the
 * Assigned to and Status popovers, and a chip for whatever is set, all drawn
 * from {@link assignmentFilterDeclarations}. Takes the binding from
 * `useAssignmentFilterState` and the assignee options, which the page builds
 * over the rows it loaded.
 */

import {
	type AssignmentFilters,
	assignmentFilterCodecs,
} from '../../../hooks/operations/use-assignment-filter-state';
import {
	ASSIGNMENT_STATUS_LABELS,
	ASSIGNMENT_STATUSES,
} from '../../../hooks/queries/assignment-view';
import type { FilterBinding } from '../../../lib/search-filters';
import type { FilterOption } from '../../explorer';
import { DeclaredFilterChips, filterFields } from '../../explorer/declared-filters';
import {
	defineFilterDeclarations,
	type FilterDeclarations,
	suppliedSource,
} from '../../explorer/filter-declarations';
import { PROFILE_UNKNOWN } from '../operations-filters';

/** The Assignments filters, in the order their chips draw. */
function assignmentFilterDeclarations(
	assigneeOptions: readonly FilterOption[],
): FilterDeclarations<AssignmentFilters> {
	return defineFilterDeclarations({ codecs: assignmentFilterCodecs }, [
		{ kind: 'dateRange', direction: 'schedule' },
		{
			kind: 'idSet',
			key: 'people',
			label: 'Assigned to',
			empty: 'No profiles',
			options: suppliedSource(assigneeOptions),
			unknown: PROFILE_UNKNOWN,
		},
		{
			kind: 'choiceSet',
			key: 'statuses',
			label: 'Status',
			empty: 'No statuses',
			options: ASSIGNMENT_STATUSES.map((value) => ({
				value,
				label: ASSIGNMENT_STATUS_LABELS[value],
			})),
		},
	]);
}

export function AssignmentFilterBar({
	binding,
	assigneeOptions,
}: {
	readonly binding: FilterBinding<AssignmentFilters>;
	readonly assigneeOptions: readonly FilterOption[];
}) {
	const declarations = assignmentFilterDeclarations(assigneeOptions);
	const fields = filterFields(declarations, binding);
	return (
		<>
			{fields.dates}

			<div className="flex flex-wrap gap-2">
				{fields.people}
				{fields.statuses}
			</div>

			<DeclaredFilterChips binding={binding} declarations={declarations} />
		</>
	);
}
