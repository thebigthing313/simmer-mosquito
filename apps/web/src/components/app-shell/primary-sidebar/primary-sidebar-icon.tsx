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
 * The pitch holds in both rail widths — only the button's width changes.
 */
export const PRIMARY_ICON_SIZE = 44;
export const PRIMARY_ICON_GAP = 6;
export const PRIMARY_ITEM_PITCH = PRIMARY_ICON_SIZE + PRIMARY_ICON_GAP;
/** Top padding of the icon list (`py-3`). The active indicator offsets by this. */
export const PRIMARY_LIST_PADDING_Y = 12;

/**
 * A single domain entry in the primary rail. Expanded it reads as an icon and a
 * label; collapsed it falls back to the icon, labelled by tooltip.
 */
export function AppShellPrimarySidebarIcon({
	domain,
	active,
	collapsed,
	onSelect,
}: {
	readonly domain: ShellDomain;
	readonly active: boolean;
	readonly collapsed: boolean;
	readonly onSelect: (domain: ShellDomain) => void;
}) {
	const Icon = domain.icon;

	const button = (
		<button
			aria-current={active ? 'page' : undefined}
			aria-label={domain.label}
			className={cn(
				'flex h-11 shrink-0 items-center rounded-md text-simmer-green-100/70 outline-none transition-colors duration-(--simmer-motion-quick) ease-(--simmer-ease-out)',
				'hover:bg-white/10 hover:text-white',
				'focus-visible:ring-2 focus-visible:ring-ring-inverse focus-visible:ring-offset-2 focus-visible:ring-offset-simmer-green-900',
				'data-[active=true]:bg-white/12 data-[active=true]:text-white',
				'[&_svg]:size-[1.15rem]',
				// Asset icons (e.g. the mosquito) render via <image> and can't inherit
				// currentColor, so tint them to match the light rail icons.
				'[&_image]:opacity-70 [&_image]:[filter:brightness(0)_invert(1)] data-[active=true]:[&_image]:opacity-100',
				collapsed ? 'w-11 justify-center' : 'w-full gap-3 px-3',
			)}
			data-active={active}
			onClick={() => onSelect(domain)}
			type="button"
		>
			<Icon aria-hidden="true" className="shrink-0" />
			{collapsed ? null : (
				<span className="min-w-0 truncate font-medium text-sm">{domain.label}</span>
			)}
		</button>
	);

	if (!collapsed) {
		return button;
	}

	return (
		<Tooltip>
			<TooltipTrigger asChild>{button}</TooltipTrigger>
			<TooltipContent side="right" sideOffset={8}>
				{domain.label}
			</TooltipContent>
		</Tooltip>
	);
}
