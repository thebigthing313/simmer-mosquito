/**
 * The Missions index's filters above the list: the date window, the Status,
 * Control type and Assigned to popovers, and a chip for whatever is set, all
 * drawn from {@link missionFilterDeclarations}. Takes the binding from
 * `useMissionFilterState` and the assignee options, which the page builds over
 * the rows it loaded.
 */

import {
	type MissionFilters,
	missionFilterCodecs,
} from '../../../hooks/operations/use-mission-filter-state';
import { MISSION_STATUS_LABELS, MISSION_STATUSES } from '../../../hooks/queries/operations-view';
import type { FilterBinding } from '../../../lib/search-filters';
import type { FilterOption } from '../../explorer';
import { DeclaredFilterChips, filterFields } from '../../explorer/declared-filters';
import {
	defineFilterDeclarations,
	type FilterDeclarations,
	suppliedSource,
} from '../../explorer/filter-declarations';
import { ASSIGNEE_UNKNOWN, CONTROL_TYPE_FILTER } from '../operations-filters';

/** The Missions filters, in the order their chips draw. */
function missionFilterDeclarations(
	assigneeOptions: readonly FilterOption[],
): FilterDeclarations<MissionFilters> {
	return defineFilterDeclarations({ codecs: missionFilterCodecs }, [
		{ kind: 'dateRange', direction: 'schedule' },
		{
			kind: 'choiceSet',
			key: 'statuses',
			label: 'Status',
			empty: 'No statuses',
			options: MISSION_STATUSES.map((value) => ({ value, label: MISSION_STATUS_LABELS[value] })),
		},
		CONTROL_TYPE_FILTER,
		{
			kind: 'idSet',
			key: 'people',
			label: 'Assigned to',
			empty: 'No profiles',
			options: suppliedSource(assigneeOptions),
			unknown: ASSIGNEE_UNKNOWN,
		},
	]);
}

export function MissionFilterBar({
	binding,
	assigneeOptions,
}: {
	readonly binding: FilterBinding<MissionFilters>;
	readonly assigneeOptions: readonly FilterOption[];
}) {
	const declarations = missionFilterDeclarations(assigneeOptions);
	const fields = filterFields(declarations, binding);
	return (
		<>
			{fields.dates}

			<div className="flex flex-wrap gap-2">
				{fields.statuses}
				{fields.types}
				{fields.people}
			</div>

			<DeclaredFilterChips binding={binding} declarations={declarations} />
		</>
	);
}
