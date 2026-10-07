import { clusterLegendEntries, type MapLegendEntry, TRAP_STATUS_COLORS } from '../../map';
/** What the Status filter can be set to. Mirrors the segmented control's options. */
export type TrapStatusFilter = 'all' | 'active' | 'inactive';

/** Every status the filter can hold, in the order the Status control lists them. */
export const TRAP_STATUS_VALUES: readonly TrapStatusFilter[] = ['all', 'active', 'inactive'];

/**
 * Each status as the Status control, its chip, the map key and the summary
 * name it, so the four cannot spell one differently.
 */
export const TRAP_STATUS_LABELS: Readonly<Record<TrapStatusFilter, string>> = {
	all: 'All',
	active: 'Active',
	inactive: 'Inactive',
};

/**
 * The key, cut down to the colours the current filter can draw, and the cluster
 * circle when the map is clustering.
 */
export function trapLegend(
	status: TrapStatusFilter,
	clustered: boolean,
): readonly MapLegendEntry[] {
	const entries: MapLegendEntry[] = [];
	if (status !== 'inactive') {
		entries.push({ color: TRAP_STATUS_COLORS.active, label: TRAP_STATUS_LABELS.active });
	}
	if (status !== 'active') {
		entries.push({ color: TRAP_STATUS_COLORS.inactive, label: TRAP_STATUS_LABELS.inactive });
	}
	entries.push(...clusterLegendEntries('trap', clustered));
	return entries;
}
