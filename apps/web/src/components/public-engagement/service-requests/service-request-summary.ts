import type { MapSummary } from '../../../hooks/explorer/use-explorer-summary';
import type { SummaryGroup, SummaryGrouping } from '../../explorer/explorer-summary';
import { intakeTypeLabel } from '../public-engagement-display';

/**
 * The Service Requests summary's Intake Type and Waiting groupings, out of
 * what `/map/service-requests/summary` answers, drawn as text after the
 * declared Status and Tags groupings, because no filter selects either.
 */
export function serviceRequestSummaryFigures(summary: MapSummary): readonly SummaryGrouping[] {
	const intakeTypes: SummaryGroup[] = (summary.groups.intakeType ?? []).flatMap(
		({ value, count }) =>
			typeof value === 'string' ? [{ key: value, label: intakeTypeLabel(value), count }] : [],
	);

	// Absent when no open request is in view, which is not the same as one
	// received today.
	const oldestOpenDays = summary.figures?.oldestOpenDays;

	return [
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
