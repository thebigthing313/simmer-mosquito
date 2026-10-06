import { clusterLegendEntries, type MapLegendEntry, TRAP_STATUS_COLORS } from '../../map';
/** What the Status filter can be set to. Mirrors the segmented control's options. */
export type StatusFilter = 'all' | 'active' | 'inactive';

/**
 * The key, cut down to the colours the current filter can draw, and the cluster
 * circle when the map is clustering.
 */
export function trapLegend(status: StatusFilter, clustered: boolean): readonly MapLegendEntry[] {
	const entries: MapLegendEntry[] = [];
	if (status !== 'inactive') {
		entries.push({ color: TRAP_STATUS_COLORS.active, label: 'Active' });
	}
	if (status !== 'active') {
		entries.push({ color: TRAP_STATUS_COLORS.inactive, label: 'Inactive' });
	}
	entries.push(...clusterLegendEntries('trap', clustered));
	return entries;
}
