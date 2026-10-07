/**
 * The way between the Address Book Map and the Addresses Table. It carries
 * the params from `sharedAddressSearch`, which is every address filter.
 * `SurfaceSwitch` in `components/explorer` carries the rule. Both paths are
 * literals because `tsc` checks a `to` and `search` pair only where the path
 * is one.
 */

import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { Link } from '@tanstack/react-router';
import { SurfaceSwitch, surfaceSwitchItem } from '../../explorer';

const MapIcon = iconRegistry.generic.map.icon;
const TableIcon = iconRegistry.generic.table.icon;

export function AddressSurfaceSwitch({
	compact = false,
	current,
	search,
}: {
	/** Draw the two segments as icons, for the map frame's panel header. */
	readonly compact?: boolean;
	readonly current: 'map' | 'table';
	/** The filter params to carry, from `sharedAddressSearch`. */
	readonly search: Record<string, unknown>;
}) {
	const isMap = current === 'map';
	return (
		<SurfaceSwitch label="Addresses view">
			<Link
				aria-current={isMap ? 'page' : undefined}
				aria-label="Map"
				className={surfaceSwitchItem({ compact, isCurrent: isMap })}
				search={search}
				title="Map"
				to="/gis/addresses"
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
				to="/gis/addresses/table"
			>
				<TableIcon aria-hidden="true" className="size-4" />
				{compact ? null : 'Table'}
			</Link>
		</SurfaceSwitch>
	);
}
