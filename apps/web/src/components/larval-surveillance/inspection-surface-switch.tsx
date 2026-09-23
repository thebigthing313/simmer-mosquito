/**
 * The way between the Inspections Map and the Inspections Table. Both read the
 * same filter params through `inspectionFilterCodecs`, and the sidebar's items
 * name a typed `to` and no `search`, so the pair carries its own control.
 * `SurfaceSwitch` in `components/explorer` carries the rule. Both paths are
 * literals because `tsc` checks a `to` and `search` pair only where the path
 * is one.
 */

import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { Link } from '@tanstack/react-router';
import { SurfaceSwitch, surfaceSwitchItem } from '../explorer';

const MapIcon = iconRegistry.generic.map.icon;
const TableIcon = iconRegistry.generic.table.icon;

/** Which of the two is being drawn, so the control can say where the reader is. */
export type InspectionSurface = 'map' | 'table';

export function InspectionSurfaceSwitch({
	compact = false,
	current,
	search,
}: {
	/** Draw the two segments as icons, for the map frame's panel header. */
	readonly compact?: boolean;
	readonly current: InspectionSurface;
	/** The filter params to carry, from `sharedInspectionSearch`. */
	readonly search: Record<string, unknown>;
}) {
	const isMap = current === 'map';
	return (
		<SurfaceSwitch label="Inspections view">
			<Link
				aria-current={isMap ? 'page' : undefined}
				aria-label="Map"
				className={surfaceSwitchItem({ compact, isCurrent: isMap })}
				search={search}
				title="Map"
				to="/larval-surveillance/inspections"
			>
				<MapIcon aria-hidden="true" className="size-4" />
				{compact ? null : 'Map'}
			</Link>
			<Link
				aria-current={isMap ? undefined : 'page'}
				aria-label="Table"
				className={surfaceSwitchItem({ compact, isCurrent: !isMap })}
				search={search}
				title="Table"
				to="/larval-surveillance/inspections/table"
			>
				<TableIcon aria-hidden="true" className="size-4" />
				{compact ? null : 'Table'}
			</Link>
		</SurfaceSwitch>
	);
}
