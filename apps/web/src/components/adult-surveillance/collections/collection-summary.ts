import type { MapSummary } from '../../../hooks/explorer/use-explorer-summary';
import type { SummaryGroup, SummaryGrouping } from '../../explorer/explorer-summary';
import { collectionStatusLabel } from './legend';

/**
 * The Collections summary's Status grouping, out of the figures
 * `/map/collections/summary` answers. The zero results and the collected are
 * drawn as text, because no filter selects them; the declared Problems,
 * Identification and Collection Method groupings come before it.
 */
export function collectionSummaryFigures(summary: MapSummary): readonly SummaryGrouping[] {
	// A figure at zero is still drawn, unlike a flag: it is text, so there is no
	// click that would empty the panel, and "Zero result 0" is an answer.
	const figures = summary.figures ?? {};
	const statuses: SummaryGroup[] = (
		[
			['zero_result', figures.zeroResult],
			['collected', figures.collected],
		] as const
	).flatMap(([status, count]) =>
		count === undefined ? [] : [{ key: status, label: collectionStatusLabel(status), count }],
	);

	return [{ key: 'status', title: 'Status', groups: statuses }];
}
