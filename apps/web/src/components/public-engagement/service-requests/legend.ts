import {
	clusterLegendEntries,
	type MapLegendEntry,
	SERVICE_REQUEST_STATUS_COLORS,
} from '../../map';
/** What the Status filter can be set to. Mirrors the segmented control's options. */
export type ServiceRequestStatusFilter = 'all' | 'open' | 'closed';

/** A request's status: open until it is closed. */
type ServiceRequestStatus = Exclude<ServiceRequestStatusFilter, 'all'>;

/** The two statuses in the order the Status filter, the chip and the summary list them. */
export const SERVICE_REQUEST_STATUS_ORDER: readonly ServiceRequestStatus[] = ['open', 'closed'];

/** What a status is called on screen. */
export function serviceRequestStatusLabel(status: ServiceRequestStatus): string {
	return status === 'open' ? 'Open' : 'Closed';
}

/**
 * The key, cut down to the colours the current filter can draw. Status is
 * single-select, so narrowing to open or closed leaves one. The cluster circle
 * follows when the map is clustering.
 */
export function serviceRequestLegend(
	status: ServiceRequestStatusFilter,
	clustered: boolean,
): readonly MapLegendEntry[] {
	const entries: MapLegendEntry[] = [];
	if (status !== 'closed') {
		entries.push({
			color: SERVICE_REQUEST_STATUS_COLORS.open,
			label: serviceRequestStatusLabel('open'),
		});
	}
	if (status !== 'open') {
		entries.push({
			color: SERVICE_REQUEST_STATUS_COLORS.closed,
			label: serviceRequestStatusLabel('closed'),
		});
	}
	entries.push(...clusterLegendEntries('serviceRequest', clustered));
	return entries;
}
