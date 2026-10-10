import type { MapSummary } from '../../../hooks/explorer/use-explorer-summary';
import type { SummaryGroup, SummaryGrouping } from '../../explorer/explorer-summary';
import { declaredSummaryGroupings } from '../../explorer/filter-declarations';
import { intakeTypeLabel } from '../public-engagement-display';
import { serviceRequestFilterDeclarations } from './service-request-filters';
import type { ServiceRequestFilters } from './service-requests-search';

/**
 * The Service Requests summary's groupings and its figure, out of what
 * `/map/service-requests/summary` answers.
 *
 * Status and Tags are the declared filters' toggle groups. Intake type and the
 * days the oldest open request has waited are drawn as text, because no
 * filter selects either.
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
	const intakeTypes: SummaryGroup[] = (summary.groups.intakeType ?? []).flatMap(
		({ value, count }) =>
			typeof value === 'string' ? [{ key: value, label: intakeTypeLabel(value), count }] : [],
	);

	// Absent when no open request is in view, which is not the same as one
	// received today.
	const oldestOpenDays = summary.figures?.oldestOpenDays;

	return [
		...declaredSummaryGroupings(serviceRequestFilterDeclarations, ['status', 'tags'], {
			summary,
			filters,
			setFilters,
			names: { tags: tagNameById },
		}),
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
