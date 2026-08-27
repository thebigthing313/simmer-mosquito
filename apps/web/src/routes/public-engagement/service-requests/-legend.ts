import { type MapLegendEntry, SERVICE_REQUEST_STATUS_COLORS } from '../../../components/map';

/** What the Status filter can be set to. Mirrors the segmented control's options. */
export type StatusFilter = 'all' | 'open' | 'closed';

/**
 * The key, cut down to the colours the current filter can actually draw.
 *
 * Status is the one filter that decides a colour here, and it is single-select,
 * so narrowing to open or closed leaves one. A key still naming the other would
 * be describing dots that are not there.
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
