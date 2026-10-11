import type { MapSummary } from '../../../hooks/explorer/use-explorer-summary';
import type { SummaryGroup, SummaryGrouping } from '../../explorer/explorer-summary';

/**
 * The Address Book summary's two figures, out of what
 * `/map/addresses/summary` answers: how many addresses in view sit in each
 * locality and under each postal code.
 *
 * Both are drawn as text with no click target, since no filter selects
 * either. The server counts a missing or blank value under null, and that
 * count is not drawn. `docs/web-components.md` says why.
 */
export function addressSummaryGroupings(summary: MapSummary): readonly SummaryGrouping[] {
	return [
		{ key: 'locality', title: 'Locality', groups: namedValues(summary, 'locality') },
		{ key: 'postal-code', title: 'Postal Code', groups: namedValues(summary, 'postalCode') },
	];
}

/** One grouping's values as text lines, largest count first, the null count left out. */
function namedValues(summary: MapSummary, grouping: string): SummaryGroup[] {
	return (summary.groups[grouping] ?? []).flatMap(({ value, count }) =>
		typeof value === 'string' ? [{ key: value, label: value, count }] : [],
	);
}
