import type { ShellNavGroup, ShellNavItem } from '../types';
import { SecondarySidebarItem } from './secondary-sidebar-item';

/** A cluster of items, optionally introduced by a quiet section label. */
export function SecondarySidebarGroup({
	group,
	activeItemId,
	onSelect,
}: {
	readonly group: ShellNavGroup;
	readonly activeItemId: string | null;
	readonly onSelect: (item: ShellNavItem) => void;
}) {
	return (
		<div className="flex flex-col gap-1">
			{group.label ? <p className="eyebrow px-2.5 pt-1">{group.label}</p> : null}
			<ul className="flex flex-col gap-0.5">
				{group.items.map((item) => (
					<SecondarySidebarItem
						key={item.id}
						item={item}
						active={item.id === activeItemId}
						onSelect={onSelect}
					/>
				))}
			</ul>
		</div>
	);
}
