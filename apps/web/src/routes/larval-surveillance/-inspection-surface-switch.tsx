/**
 * The way between the Inspections Map and the Inspections Table.
 *
 * Both surfaces draw the same records and read the same filter params through
 * `inspectionFilterCodecs`, so a reader who has narrowed one expects to arrive
 * at the other still narrowed. The sidebar cannot do that: its items name a
 * typed `to` and nothing else, and a navigation naming no `search` arrives with
 * the query string gone. So the pair carries its own control, whose `Link`s name
 * the search they carry. `SurfaceSwitch` in `components/explorer` carries the
 * rule this is an instance of.
 *
 * Both paths are written out here rather than passed in, because `tsc` checks a
 * `to` and `search` pair against the generated route tree only where the path is
 * a literal.
 */

import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { Link } from '@tanstack/react-router';
import { SurfaceSwitch, surfaceSwitchItem } from '../../components/explorer';

const MapIcon = iconRegistry.generic.map.icon;
const TableIcon = iconRegistry.generic.table.icon;

/** Which of the two is being drawn, so the control can say where the reader is. */
export type InspectionSurface = 'map' | 'table';

export function InspectionSurfaceSwitch({
	compact = false,
	current,
	search,
}: {
	/**
	 * Draw the two segments as icons, for the map frame's panel header. The word
	 * moves to `aria-label`, which is where that header's other controls keep it.
	 */
	readonly compact?: boolean;
	readonly current: InspectionSurface;
	/**
	 * The filter params to carry, from `sharedInspectionSearch`. Passed in rather
	 * than read here, so the control resolves the same href wherever it is drawn.
	 */
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
