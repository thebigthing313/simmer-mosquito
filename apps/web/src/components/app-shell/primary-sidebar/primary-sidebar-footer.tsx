import { Avatar, AvatarFallback, AvatarImage } from '@simmer-mosquito/ui-web/components/ui/avatar';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '@simmer-mosquito/ui-web/components/ui/dropdown-menu';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { useShell } from '../shell-context';

const SettingsIcon = iconRegistry.generic.settings.icon;
const MembersIcon = iconRegistry.entities.organization.icon;
const ProfileIcon = iconRegistry.actions.edit.icon;
const SignOutIcon = iconRegistry.arrows.arrowRight.icon;

function initials(name: string): string {
	const parts = name.trim().split(/\s+/).filter(Boolean);
	if (parts.length === 0) {
		return '?';
	}
	const [first] = parts;
	const last = parts.length > 1 ? parts[parts.length - 1] : undefined;
	return `${first?.[0] ?? ''}${last?.[0] ?? ''}`.toUpperCase();
}

/** Account entry point: the avatar opens user + organization management. */
export function PrimarySidebarFooter() {
	const { user, onNavigate, onSignOut } = useShell();

	return (
		<div className="flex shrink-0 items-center justify-center pb-3">
			<DropdownMenu>
				<DropdownMenuTrigger
					className={cn(
						'rounded-full outline-none',
						'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-simmer-green-900',
						'data-[state=open]:ring-2 data-[state=open]:ring-ring/60',
					)}
					aria-label="Account and settings"
				>
					<Avatar size="default" className="border border-white/20 bg-secondary">
						{user.avatarUrl ? <AvatarImage src={user.avatarUrl} alt="" /> : null}
						<AvatarFallback className="bg-secondary font-semibold text-secondary-foreground">
							{initials(user.name)}
						</AvatarFallback>
					</Avatar>
				</DropdownMenuTrigger>
				<DropdownMenuContent side="right" align="end" sideOffset={10} className="w-60">
					<DropdownMenuLabel className="flex flex-col gap-0.5 py-2">
						<span className="truncate font-semibold text-foreground">{user.name}</span>
						<span className="truncate text-xs font-normal text-muted-foreground">{user.email}</span>
						{user.role ? (
							<span className="mt-1 text-xs font-medium text-primary">{user.role}</span>
						) : null}
					</DropdownMenuLabel>
					<DropdownMenuSeparator />
					<DropdownMenuGroup>
						<DropdownMenuItem onSelect={() => onNavigate('/account/profile')}>
							<ProfileIcon />
							Profile
						</DropdownMenuItem>
						<DropdownMenuItem onSelect={() => onNavigate('/organization')}>
							<SettingsIcon />
							Organization settings
						</DropdownMenuItem>
						<DropdownMenuItem onSelect={() => onNavigate('/organization/members')}>
							<MembersIcon />
							Members &amp; roles
						</DropdownMenuItem>
					</DropdownMenuGroup>
					{onSignOut ? (
						<>
							<DropdownMenuSeparator />
							<DropdownMenuItem variant="destructive" onSelect={onSignOut}>
								<SignOutIcon />
								Sign out
							</DropdownMenuItem>
						</>
					) : null}
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	);
}
