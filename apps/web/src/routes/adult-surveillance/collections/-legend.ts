import { COLLECTION_STATUS_COLORS, type MapLegendEntry } from '../../../components/map';

/** The status the server resolves for a collection, by precedence. */
export type CollectionStatusValue = 'pending' | 'problem' | 'zero_result' | 'collected';

/** Ordered out → back, the way a round reads. */
const STATUS_ORDER: readonly CollectionStatusValue[] = [
	'pending',
	'collected',
	'zero_result',
	'problem',
];

const STATUS_LABEL: Record<CollectionStatusValue, string> = {
	pending: 'Trap out',
	collected: 'Collected',
	zero_result: 'Zero result',
	problem: 'Problem reported',
};

/** What one collection reads as in the rail and in the key. */
export function collectionStatusLabel(status: CollectionStatusValue): string {
	return STATUS_LABEL[status];
}

/**
 * The key, cut down to the colours the current filters can actually draw.
 *
 * Problems only leaves one colour on the map, so a key still listing the other
 * three would be describing dots that are not there.
 */
export function collectionLegend(problemOnly: boolean): readonly MapLegendEntry[] {
	const shown: readonly CollectionStatusValue[] = problemOnly ? ['problem'] : STATUS_ORDER;
	// `COLLECTION_STATUS_COLORS` is keyed by the server's status strings, so a
	// status the ramp does not paint drops out rather than being listed uncoloured.
	return shown.flatMap((value): MapLegendEntry[] => {
		const color = COLLECTION_STATUS_COLORS[value];
		return color === undefined ? [] : [{ color, label: STATUS_LABEL[value] }];
	});
}
