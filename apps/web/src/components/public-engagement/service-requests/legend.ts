import { type MapLegendEntry, SERVICE_REQUEST_STATUS_COLORS } from '../../map';
/** What the Status filter can be set to. Mirrors the segmented control's options. */
export type StatusFilter = 'all' | 'open' | 'closed';

/**
 * The key, cut down to the colours the current filter can draw. Status is
 * single-select, so narrowing to open or closed leaves one.
 */
export function serviceRequestLegend(status: StatusFilter): readonly MapLegendEntry[] {
	const entries: MapLegendEntry[] = [];
	if (status !== 'closed') {
		entries.push({ color: SERVICE_REQUEST_STATUS_COLORS.open, label: 'Open' });
	}
	if (status !== 'open') {
		entries.push({ color: SERVICE_REQUEST_STATUS_COLORS.closed, label: 'Closed' });
	}
	return entries;
}
