import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from '@simmer-mosquito/ui-web/components/ui/tooltip';
import { HammerIcon } from '@simmer-mosquito/ui-web/icons/registry';
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
				aria-current={active ? 'page' : undefined}
				className={cn(
					'flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sidebar-foreground text-sm outline-none transition-colors duration-(--simmer-motion-quick) ease-(--simmer-ease-out)',
					'hover:bg-sidebar-accent/70 focus-visible:ring-2 focus-visible:ring-ring',
					'data-[active=true]:bg-sidebar-accent data-[active=true]:font-medium data-[active=true]:text-sidebar-accent-foreground',
					'[&_svg]:size-4 [&_svg]:shrink-0',
				)}
				data-active={active}
				onClick={() => onSelect(item)}
				type="button"
			>
				{Icon ? (
					<Icon
						aria-hidden="true"
						className={cn('text-muted-foreground', active && 'text-primary')}
					/>
				) : null}
				{/*
				 * Nav labels wrap rather than truncate. A destination's label is the only
				 * thing identifying it — "Source Reduction Metho…" and "Source Reduction
				 * Map" are the same row to a reader — so an extra line costs less than an
				 * unreadable one. `items-center` above then centres the icon against the
				 * wrapped block.
				 */}
				<span className="min-w-0 flex-1 wrap-anywhere text-left text-pretty leading-snug">
					{item.label}
				</span>
				{/*
				 * Placeholder sections are marked here rather than left to be discovered
				 * on arrival — an operator planning their day should be able to see from
				 * the navigation which sections cannot yet do anything.
				 */}
				{item.stub === true ? (
					<Tooltip>
						<TooltipTrigger asChild>
							<span aria-label="Work in progress" className="text-muted-foreground/70" role="img">
								<HammerIcon aria-hidden="true" />
							</span>
						</TooltipTrigger>
						<TooltipContent side="right">Work in progress</TooltipContent>
					</Tooltip>
				) : null}
				{item.badge !== undefined ? (
					<span
						className={cn(
							'inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 font-semibold text-xs tabular-nums',
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
