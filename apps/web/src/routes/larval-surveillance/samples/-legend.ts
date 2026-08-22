import { type MapLegendEntry, SAMPLE_STATUS_COLORS } from '../../../components/map';
import type { SampleStatusValue } from '../-samples-search';

/** Ordered awaiting → identified → closed-out, the way the filter chips read. */
const STATUS_ORDER: readonly Exclude<SampleStatusValue, 'all'>[] = [
	'awaiting',
	'identified',
	'zero_larvae',
	'unidentifiable',
];

const STATUS_LABEL: Record<Exclude<SampleStatusValue, 'all'>, string> = {
	identified: 'Identified',
	awaiting: 'Awaiting ID',
	zero_larvae: 'No larvae',
	unidentifiable: 'Unidentifiable',
};

/**
 * The key, cut down to the colours the current filter can actually draw.
 *
 * The status filter is single-select, so narrowing to one status leaves one
 * colour on the map. A key still listing the other three would be describing
 * dots that are not there.
 */
export function sampleLegend(status: SampleStatusValue): readonly MapLegendEntry[] {
	const shown = status === 'all' ? STATUS_ORDER : [status];
	// `SAMPLE_STATUS_COLORS` is keyed by the server's status strings, so a status
	// the ramp does not paint drops out rather than being listed uncoloured.
	return shown.flatMap((value): MapLegendEntry[] => {
		const color = SAMPLE_STATUS_COLORS[value];
		return color === undefined ? [] : [{ color, label: STATUS_LABEL[value] }];
	});
}
