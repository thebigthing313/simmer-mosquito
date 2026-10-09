import { useState } from 'react';
import type { FilterOption } from '../../components/explorer/multi-select-filter';

/** The assignee filter's id for a row with a null `assignedToProfileId`. */
const UNASSIGNED = 'unassigned';

/** The status and assignee sets a worklist filters on; an empty set is off. */
export interface WorklistIndexFilters {
	readonly statuses: ReadonlySet<string>;
	readonly people: ReadonlySet<string>;
}

/**
 * The selection, filtering and assignee options a worklist index page shares
 * with the other one, for the Missions and Assignments pages.
 *
 * Takes the loaded rows, how to read a row's status and assignee, the status
 * and assignee sets, an optional `matches` for a filter the page has and the
 * other does not, and the people from `usePersonnelOptions`. Returns the rows
 * that pass, the selected row id (the one picked while it is still visible,
 * else the first visible row, else null) and that row, the selected stop and
 * the highlighted stop with their setters, `handleSelect`, the assignee
 * options with `Unassigned` first, and the label an assignee chip reads.
 */
export function useWorklistIndex<Row extends { readonly id: string }>({
	rows,
	statusOf,
	assigneeOf,
	filters,
	matches,
	personnel,
}: {
	readonly rows: readonly Row[];
	readonly statusOf: (row: Row) => string;
	readonly assigneeOf: (row: Row) => string | null;
	readonly filters: WorklistIndexFilters;
	readonly matches?: (row: Row) => boolean;
	readonly personnel: {
		readonly options: readonly FilterOption[];
		readonly nameById: ReadonlyMap<string, string>;
	};
}) {
	const [pickedId, setPickedId] = useState<string | null>(null);
	const [selectedStopId, setSelectedStopId] = useState<string | null>(null);
	const [highlightId, setHighlightId] = useState<string | null>(null);

	const visible = rows.filter(
		(row) =>
			(filters.statuses.size === 0 || filters.statuses.has(statusOf(row))) &&
			(filters.people.size === 0 || filters.people.has(assigneeOf(row) ?? UNASSIGNED)) &&
			(matches === undefined || matches(row)),
	);

	const selected =
		(pickedId === null ? undefined : visible.find((row) => row.id === pickedId)) ??
		visible[0] ??
		null;

	const handleSelect = (id: string) => {
		setPickedId(id);
		setSelectedStopId(null);
		setHighlightId(null);
	};

	const assigneeOptions: readonly FilterOption[] = [
		{ id: UNASSIGNED, label: 'Unassigned' },
		...personnel.options,
	];

	const assigneeLabel = (id: string): string =>
		id === UNASSIGNED ? 'Unassigned' : (personnel.nameById.get(id) ?? 'Unknown profile');

	return {
		visible,
		selectedId: selected?.id ?? null,
		selected,
		selectedStopId,
		setSelectedStopId,
		highlightId,
		setHighlightId,
		handleSelect,
		assigneeOptions,
		assigneeLabel,
	};
}
