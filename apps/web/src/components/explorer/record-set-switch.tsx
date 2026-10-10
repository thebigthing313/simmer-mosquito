/**
 * The way between a record set's Map and its Table, drawn on both. It takes
 * the surface's validated search and carries to each surface the filters that
 * surface applies, through `carriedSearch`. `SurfaceSwitch` carries the rule
 * and `defineRecordSet` carries which keys each surface applies.
 */

import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { Link } from '@tanstack/react-router';
import { type RecordType, recordNoun } from '../../lib/record-nouns';
import { carriedSearch, type RecordSetLinks, type RecordSetSurface } from './record-set';
import { SurfaceSwitch, surfaceSwitchItem } from './surface-switch';

const MapIcon = iconRegistry.generic.map.icon;
const TableIcon = iconRegistry.generic.table.icon;

/** `Biocontrol actions view`: the register's plural, its first letter raised. */
function switchLabel(recordType: RecordType): string {
	const { many } = recordNoun(recordType);
	return `${many.charAt(0).toUpperCase()}${many.slice(1)} view`;
}

export function RecordSetSwitch({
	compact = false,
	current,
	search,
	set,
}: {
	/** Draw the two segments as icons, for the map frame's panel header. */
	readonly compact?: boolean;
	readonly current: RecordSetSurface;
	/** The current surface's validated search. */
	readonly search: Record<string, unknown>;
	readonly set: RecordSetLinks<unknown>;
}) {
	const isMap = current === 'map';
	return (
		<SurfaceSwitch label={switchLabel(set.recordType)}>
			<Link
				aria-current={isMap ? 'page' : undefined}
				aria-label="Map"
				className={surfaceSwitchItem({ compact, isCurrent: isMap })}
				search={carriedSearch(set, search, 'map')}
				title="Map"
				to={set.paths.map}
			>
				<MapIcon aria-hidden="true" className="size-4" />
				{compact ? null : 'Map'}
			</Link>
			<Link
				aria-current={isMap ? undefined : 'page'}
				aria-label="Table"
				className={surfaceSwitchItem({ compact, isCurrent: !isMap })}
				search={carriedSearch(set, search, 'table')}
				title="Table"
				to={set.paths.table}
			>
				<TableIcon aria-hidden="true" className="size-4" />
				{compact ? null : 'Table'}
			</Link>
		</SurfaceSwitch>
	);
}
