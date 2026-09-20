import { useState } from 'react';
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
	// The last ready rows are state, written in the render that reads them
	// ready. React re-renders before committing, so the write costs no frame,
	// and the read below is a comparison rather than a ref read in render.
	const [held, setHeld] = useState({ rows, windowKey });
	if (isReady) {
		if (held.rows !== rows || held.windowKey !== windowKey) {
			setHeld({ rows, windowKey });
		}
		return rows;
	}
	return held.windowKey === windowKey ? held.rows : NO_ROWS;
}
