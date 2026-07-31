import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from '@simmer-mosquito/ui-web/components/ui/tooltip';
import { PanelLeftIcon } from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';

/**
 * Collapses the rail to icons and back. It sits between the domain list and the
 * account block so it holds one position in both states — a control that moves
 * when you use it is a control you have to re-find every time.
 */
export function PrimarySidebarToggle({
	collapsed,
	onToggle,
}: {
	readonly collapsed: boolean;
	readonly onToggle: () => void;
}) {
	const label = collapsed ? 'Expand sidebar' : 'Collapse sidebar';

	const button = (
		<button
			aria-label={label}
			className={cn(
				'flex h-9 items-center rounded-md text-simmer-green-100/70 outline-none transition-colors duration-(--simmer-motion-quick) ease-(--simmer-ease-out)',
				'hover:bg-white/10 hover:text-white',
				'focus-visible:ring-2 focus-visible:ring-ring-inverse focus-visible:ring-offset-2 focus-visible:ring-offset-simmer-green-900',
				collapsed ? 'w-9 justify-center' : 'w-full gap-3 px-3',
			)}
			onClick={onToggle}
			type="button"
		>
			<PanelLeftIcon aria-hidden="true" className="size-[1.15rem] shrink-0" />
			{collapsed ? null : <span className="truncate text-sm">Collapse</span>}
		</button>
	);

	return (
		<div
			className={cn(
				'flex shrink-0 border-white/10 border-t py-2',
				collapsed ? 'justify-center px-0' : 'px-3',
			)}
		>
			{collapsed ? (
				<Tooltip>
					<TooltipTrigger asChild>{button}</TooltipTrigger>
					<TooltipContent side="right" sideOffset={8}>
						{label}
					</TooltipContent>
				</Tooltip>
			) : (
				button
			)}
		</div>
	);
}
