import { type MapLegendEntry, TRAP_STATUS_COLORS } from '../../../components/map';

/** What the Status filter can be set to. Mirrors the segmented control's options. */
export type StatusFilter = 'all' | 'active' | 'inactive';

/**
 * The key, cut down to the colours the current filter can actually draw.
 *
 * The map has painted traps by status since it was built and never said so.
 * That was survivable while every row carried an Active or Inactive pill; with
 * the pill gone the dot is the status, and a dot needs a key.
 */
export function trapLegend(status: StatusFilter): readonly MapLegendEntry[] {
	const entries: MapLegendEntry[] = [];
	if (status !== 'inactive') {
		entries.push({ color: TRAP_STATUS_COLORS.active, label: 'Active' });
	}
	if (status !== 'active') {
		entries.push({ color: TRAP_STATUS_COLORS.inactive, label: 'Inactive' });
	}
	return entries;
}
