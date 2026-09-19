import { useRef } from 'react';
import type { InspectionTableRow } from '../queries/larval-activity-view';

/** One array rather than a new empty one per render, which would re-render the table. */
const NO_ROWS: readonly InspectionTableRow[] = [];

/**
 * The rows on screen, held through the first read of a wider window.
 *
 * While the live query is not ready, hands back the last ready rows if they
 * were read under the same `windowKey`, and none otherwise.
 */
export function useHeldRows(
	rows: readonly InspectionTableRow[],
	isReady: boolean,
	windowKey: string,
): readonly InspectionTableRow[] {
	// no-memo-reason: a render-phase ref read is the cache, and no compiler release makes that compilable.
	'use no memo';

	const held = useRef({ rows, windowKey });
	if (isReady) {
		held.current = { rows, windowKey };
		return rows;
	}
	return held.current.windowKey === windowKey ? held.current.rows : NO_ROWS;
}
