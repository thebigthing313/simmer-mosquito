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
			{/*
			 * The `.eyebrow` utilities inline rather than by class name: this file
			 * ships from a package now, and a shared component that only looks right
			 * when the consuming app happens to define a class is a trap for the next
			 * app to mount the shell.
			 */}
			{group.label ? (
				<p className="m-0 px-2.5 pt-1 text-[0.74rem] font-extrabold text-primary uppercase leading-[1.1] tracking-[0.06em]">
					{group.label}
				</p>
			) : null}
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
