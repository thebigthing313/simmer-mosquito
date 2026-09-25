/**
 * The way between the Service Requests Map and the Service Requests Table. It
 * carries the params the two share, from `sharedServiceRequestSearch`.
 * `SurfaceSwitch` in `components/explorer` carries the rule. Both paths are
 * literals because `tsc` checks a `to` and `search` pair only where the path
 * is one.
 */

import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { Link } from '@tanstack/react-router';
import { SurfaceSwitch, surfaceSwitchItem } from '../../explorer';

const MapIcon = iconRegistry.generic.map.icon;
const TableIcon = iconRegistry.generic.table.icon;

export function ServiceRequestSurfaceSwitch({
	compact = false,
	current,
	search,
}: {
	/** Draw the two segments as icons, for the map frame's panel header. */
	readonly compact?: boolean;
	readonly current: 'map' | 'table';
	/** The filter params to carry, from `sharedServiceRequestSearch`. */
	readonly search: Record<string, unknown>;
}) {
	const isMap = current === 'map';
	return (
		<SurfaceSwitch label="Service requests view">
			<Link
				aria-current={isMap ? 'page' : undefined}
				aria-label="Map"
				className={surfaceSwitchItem({ compact, isCurrent: isMap })}
				search={search}
				title="Map"
				to="/public-engagement/service-requests"
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
				to="/public-engagement/service-requests/table"
			>
				<TableIcon aria-hidden="true" className="size-4" />
				{compact ? null : 'Table'}
			</Link>
		</SurfaceSwitch>
	);
}
