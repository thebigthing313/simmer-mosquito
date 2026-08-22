import { HABITAT_STATUS_COLORS, type MapLegendEntry } from '../../../components/map';

/** What the Status filter can be set to. Mirrors the segmented control's options. */
export type StatusFilter = 'all' | 'active' | 'inactive';
/** What the Access filter can be set to. */
export type AccessFilter = 'all' | 'accessible' | 'inaccessible';

/**
 * The key, cut down to the colours the current filters can actually draw.
 *
 * The paint expression reads inaccessible first, then active, so an
 * inaccessible Habitat is red whether or not it is also active. Status All with
 * Access Accessible therefore paints green and grey and no red, and a key that
 * still listed red would be describing dots that are not there.
 */
export function habitatLegend(
	status: StatusFilter,
	access: AccessFilter,
): readonly MapLegendEntry[] {
	const entries: MapLegendEntry[] = [];
	if (access !== 'inaccessible') {
		if (status !== 'inactive') {
			entries.push({ color: HABITAT_STATUS_COLORS.active, label: 'Active' });
		}
		if (status !== 'active') {
			entries.push({ color: HABITAT_STATUS_COLORS.inactive, label: 'Inactive' });
		}
	}
	if (access !== 'accessible') {
		entries.push({ color: HABITAT_STATUS_COLORS.inaccessible, label: 'Inaccessible' });
	}
	return entries;
}
