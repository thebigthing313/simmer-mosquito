import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from '@simmer-mosquito/ui-web/components/ui/tooltip';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import type { ShellDomain } from '../types';

/**
 * Layout constants shared with the active indicator so its travel matches the
 * rendered button pitch exactly. Keep these in sync if the rail spacing changes.
 */
export const PRIMARY_ICON_SIZE = 44;
export const PRIMARY_ICON_GAP = 6;
export const PRIMARY_ITEM_PITCH = PRIMARY_ICON_SIZE + PRIMARY_ICON_GAP;
/** Top padding of the icon list (`py-3`). The active indicator offsets by this. */
export const PRIMARY_LIST_PADDING_Y = 12;

/** A single domain entry in the primary rail: icon-only, labelled by tooltip. */
export function AppShellPrimarySidebarIcon({
	domain,
	active,
	onSelect,
}: {
	readonly domain: ShellDomain;
	readonly active: boolean;
	readonly onSelect: (domain: ShellDomain) => void;
}) {
	const Icon = domain.icon;

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<button
					type="button"
					aria-label={domain.label}
					aria-current={active ? 'page' : undefined}
					data-active={active}
					onClick={() => onSelect(domain)}
					className={cn(
						'grid size-11 shrink-0 place-items-center rounded-md text-simmer-green-100/70 outline-none transition-colors duration-(--simmer-motion-quick) ease-(--simmer-ease-out)',
						'hover:bg-white/10 hover:text-white',
						'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-simmer-green-900',
						'data-[active=true]:bg-white/12 data-[active=true]:text-white',
						'[&_svg]:size-[1.15rem]',
						// Asset icons (e.g. the mosquito) render via <image> and can't inherit
						// currentColor, so tint them to match the light rail icons.
						'[&_image]:opacity-70 [&_image]:[filter:brightness(0)_invert(1)] data-[active=true]:[&_image]:opacity-100',
					)}
				>
					<Icon aria-hidden="true" />
				</button>
			</TooltipTrigger>
			<TooltipContent side="right" sideOffset={8}>
				{domain.label}
			</TooltipContent>
		</Tooltip>
	);
}
