import { eyebrow } from '@simmer-mosquito/ui-web/components/eyebrow';
import { usePersistentFlag } from '@simmer-mosquito/ui-web/hooks/use-persistent-flag';
import { ChevronDownIcon } from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { useId } from 'react';
import type { ShellNavGroup, ShellNavItem } from '../types';
import { SecondarySidebarItem } from './secondary-sidebar-item';

/*
 * The `.eyebrow` utilities inline rather than by class name: this file ships
 * from a package now, and a shared component that only looks right when the
 * consuming app happens to define a class is a trap for the next app to mount
 * the shell.
 */
const GROUP_LABEL = eyebrow({ tone: 'primary', className: 'px-2.5 pt-1' });

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
	const listId = useId();
	const [collapsed, setCollapsed] = usePersistentFlag(collapsedKey(group.id), false);
	const canCollapse = group.collapsible === true && group.label !== undefined && group.label !== '';
	const isOpen = !canCollapse || !collapsed;

	return (
		<div className="flex flex-col gap-1">
			{canCollapse ? (
				<button
					aria-controls={listId}
					aria-expanded={isOpen}
					className={cn(
						GROUP_LABEL,
						'flex items-center justify-between gap-2 rounded-sm pb-0.5 text-left hover:text-primary/80 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring',
					)}
					onClick={() => setCollapsed(isOpen)}
					type="button"
				>
					{group.label}
					<ChevronDownIcon
						aria-hidden="true"
						className={cn('size-3.5 shrink-0 transition-transform', !isOpen && '-rotate-90')}
					/>
				</button>
			) : group.label ? (
				<p className={GROUP_LABEL}>{group.label}</p>
			) : null}
			{/* Hidden rather than unmounted, so `aria-controls` names an element either way. */}
			<ul className="flex flex-col gap-0.5" hidden={!isOpen} id={listId}>
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

/** Where this browser keeps whether a group was left folded. */
function collapsedKey(groupId: string): string {
	return `simmer.nav-group-collapsed.${groupId}`;
}
