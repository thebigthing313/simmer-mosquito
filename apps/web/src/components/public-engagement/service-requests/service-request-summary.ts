import type { MapSummary } from '../../../hooks/explorer/use-explorer-summary';
import type { SummaryGroup, SummaryGrouping } from '../../explorer/explorer-summary';
import { toggle } from '../../explorer/multi-select-filter';
import { intakeTypeLabel } from '../public-engagement-display';
import { SERVICE_REQUEST_STATUS_ORDER, serviceRequestStatusLabel } from './legend';
import type { ServiceRequestFilters } from './service-requests-search';

/**
 * The Service Requests summary's groupings and its figure, out of what
 * `/map/service-requests/summary` answers, each value wired to the filter it
 * names.
 *
 * Open and Closed set `status`, replacing the one there, and a Tag is added to
 * `tags`. A value the filter already holds is selected, and clicking it widens
 * back out: `status` goes to `all`, the Tag leaves the set. Tag names come
 * from the catalog the chips read, since the server answers ids. Intake type
 * and the days the oldest open request has waited are drawn as text, because
 * no filter selects either.
 */
export function serviceRequestSummaryGroupings({
	summary,
	filters,
	setFilters,
	tagNameById,
}: {
	readonly summary: MapSummary;
	readonly filters: ServiceRequestFilters;
	readonly setFilters: (patch: Partial<ServiceRequestFilters>) => void;
	readonly tagNameById: ReadonlyMap<string, string>;
}): readonly SummaryGrouping[] {
	const counts = (grouping: string) => summary.groups[grouping] ?? [];

	// In the order the Status filter lists them rather than by count, so Open
	// sits in the same place whichever holds more.
	const statuses: SummaryGroup[] = SERVICE_REQUEST_STATUS_ORDER.map((status) => {
		const isSelected = filters.status === status;
		return {
			key: status,
			label: serviceRequestStatusLabel(status),
			count: counts('status').find((group) => group.value === status)?.count ?? 0,
			isSelected,
			onToggle: () => setFilters({ status: isSelected ? 'all' : status }),
		};
	});

	const tags: SummaryGroup[] = counts('tagId').flatMap(({ value, count }) =>
		typeof value === 'string'
			? [
					{
						key: value,
						label: tagNameById.get(value) ?? 'Unknown tag',
						count,
						isSelected: filters.tags.has(value),
						onToggle: () => setFilters({ tags: toggle(filters.tags, value) }),
					},
				]
			: [],
	);

	const intakeTypes: SummaryGroup[] = counts('intakeType').flatMap(({ value, count }) =>
		typeof value === 'string' ? [{ key: value, label: intakeTypeLabel(value), count }] : [],
	);

	// Absent when no open request is in view, which is not the same as one
	// received today.
	const oldestOpenDays = summary.figures?.oldestOpenDays;

	return [
		{ key: 'status', title: 'Status', groups: statuses.filter(hasRecords) },
		{ key: 'tags', title: 'Tags', groups: tags },
		{ key: 'intake', title: 'Intake Type', groups: intakeTypes },
		{
			key: 'waiting',
			title: 'Waiting',
			groups:
				oldestOpenDays === undefined
					? []
					: [
							{
								key: 'oldest-open',
								label: 'Days the oldest open request has waited',
								count: oldestOpenDays,
							},
						],
		},
	];
}

/** A status no request in view has is not drawn, because clicking it would empty the panel. */
function hasRecords(group: SummaryGroup): boolean {
	return group.count > 0;
}
