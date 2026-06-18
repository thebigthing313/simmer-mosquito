import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import type { ShellNavItem } from '../types';

/** A single labelled destination in the secondary sidebar. */
export function SecondarySidebarItem({
	item,
	active,
	onSelect,
}: {
	readonly item: ShellNavItem;
	readonly active: boolean;
	readonly onSelect: (item: ShellNavItem) => void;
}) {
	const Icon = item.icon;

	return (
		<li>
			<button
				type="button"
				aria-current={active ? 'page' : undefined}
				data-active={active}
				onClick={() => onSelect(item)}
				className={cn(
					'flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-sidebar-foreground outline-none transition-colors duration-(--simmer-motion-quick) ease-(--simmer-ease-out)',
					'hover:bg-sidebar-accent/70 focus-visible:ring-2 focus-visible:ring-ring',
					'data-[active=true]:bg-sidebar-accent data-[active=true]:font-medium data-[active=true]:text-sidebar-accent-foreground',
					'[&_svg]:size-4 [&_svg]:shrink-0',
				)}
			>
				{Icon ? (
					<Icon
						aria-hidden="true"
						className={cn('text-muted-foreground', active && 'text-primary')}
					/>
				) : null}
				<span className="min-w-0 flex-1 truncate text-left">{item.label}</span>
				{item.badge !== undefined ? (
					<span
						className={cn(
							'inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-semibold tabular-nums',
							active
								? 'bg-primary text-primary-foreground'
								: 'bg-sidebar-accent text-muted-foreground',
						)}
					>
						{item.badge}
					</span>
				) : null}
			</button>
		</li>
	);
}
