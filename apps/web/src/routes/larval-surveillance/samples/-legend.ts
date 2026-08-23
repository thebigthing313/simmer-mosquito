import { type MapLegendEntry, SAMPLE_STATUS_COLORS } from '../../../components/map';
import type { SampleStatusValue } from '../-samples-search';

/** A sample's status, with the filter's "all" taken off. */
export type SampleStatus = Exclude<SampleStatusValue, 'all'>;

/** Ordered awaiting → identified → closed-out, the way the filter chips read. */
export const SAMPLE_STATUS_ORDER: readonly SampleStatus[] = [
	'awaiting',
	'identified',
	'zero_larvae',
	'unidentifiable',
];

const STATUS_LABEL: Record<SampleStatus, string> = {
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
/** What one sample reads as in the chips, the rail and the key. */
export function sampleStatusLabel(status: SampleStatus): string {
	return STATUS_LABEL[status];
}

export function sampleLegend(status: SampleStatusValue): readonly MapLegendEntry[] {
	const shown: readonly SampleStatus[] = status === 'all' ? SAMPLE_STATUS_ORDER : [status];
	return shown.map((value) => ({ color: SAMPLE_STATUS_COLORS[value], label: STATUS_LABEL[value] }));
}
