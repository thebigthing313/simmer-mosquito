import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuTrigger,
} from '@simmer-mosquito/ui-web/components/ui/dropdown-menu';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { useShell } from '../shell-context';

const ExpandIcon = iconRegistry.arrows.chevronDown.icon;

/**
 * The organization switcher. It anchors the secondary sidebar with the current
 * organization name (wrapping to two lines, then truncating) and a menu to move
 * between the organizations the operator belongs to. Logos are not yet
 * supported, so the name carries the identity on its own. Its height matches
 * the header so the top dividers align across columns.
 */
export function SecondarySidebarHeader() {
	const { organizations, currentOrganization, onSelectOrganization } = useShell();
	const canSwitch = organizations.length > 1;

	return (
		<div className="flex h-16 shrink-0 items-center border-b border-sidebar-border px-2">
			<DropdownMenu>
				<DropdownMenuTrigger
					className={cn(
						'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left outline-none transition-colors duration-(--simmer-motion-quick) ease-(--simmer-ease-out)',
						'hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-ring',
						'data-[state=open]:bg-sidebar-accent',
					)}
				>
					<span className="line-clamp-2 min-w-0 flex-1 text-sm font-semibold text-foreground">
						{currentOrganization.name}
					</span>
					<ExpandIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
				</DropdownMenuTrigger>
				<DropdownMenuContent
					align="start"
					sideOffset={6}
					className="w-(--radix-dropdown-menu-trigger-width) min-w-64"
				>
					<DropdownMenuLabel className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
						{canSwitch ? 'Switch organization' : 'Organization'}
					</DropdownMenuLabel>
					{organizations.map((organization) => (
						<DropdownMenuItem
							key={organization.id}
							onSelect={() => onSelectOrganization(organization.id)}
							className="py-2 text-sm font-medium text-foreground"
						>
							<span className="min-w-0 flex-1 truncate">{organization.name}</span>
						</DropdownMenuItem>
					))}
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	);
}
