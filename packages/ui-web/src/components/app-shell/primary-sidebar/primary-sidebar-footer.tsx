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
import { iconRegistry, MoreHorizontalIcon } from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { useShell } from '../shell-context';

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

/**
 * Account entry point. Expanded it names who is signed in and in what role —
 * the two things an operator checks before writing a record that will be
 * attributed to them. Collapsed it falls back to the avatar alone.
 */
export function PrimarySidebarFooter({ collapsed }: { readonly collapsed: boolean }) {
	const { user, onNavigate, onSignOut, accountLinks } = useShell();

	const avatar = (
		<Avatar className="shrink-0 border border-white/20 bg-secondary" size="default">
			{user.avatarUrl ? <AvatarImage alt="" src={user.avatarUrl} /> : null}
			<AvatarFallback className="bg-secondary font-semibold text-secondary-foreground">
				{initials(user.name)}
			</AvatarFallback>
		</Avatar>
	);

	return (
		<div className={cn('flex shrink-0 items-center pb-3', collapsed ? 'justify-center' : 'px-3')}>
			<DropdownMenu>
				<DropdownMenuTrigger
					aria-label="Account and settings"
					className={cn(
						'flex items-center outline-none transition-colors duration-(--simmer-motion-quick) ease-(--simmer-ease-out)',
						'focus-visible:ring-2 focus-visible:ring-ring-inverse focus-visible:ring-offset-2 focus-visible:ring-offset-simmer-green-900',
						collapsed
							? 'rounded-full data-[state=open]:ring-2 data-[state=open]:ring-ring/60'
							: 'w-full gap-2.5 rounded-md px-2 py-1.5 text-left hover:bg-white/10 data-[state=open]:bg-white/10',
					)}
				>
					{avatar}
					{collapsed ? null : (
						<>
							<span className="grid min-w-0 flex-1">
								<span className="truncate font-medium text-sm text-white">{user.name}</span>
								{user.role ? (
									<span className="truncate text-simmer-green-100/70 text-xs">{user.role}</span>
								) : null}
							</span>
							<MoreHorizontalIcon
								aria-hidden="true"
								className="size-4 shrink-0 text-simmer-green-100/70"
							/>
						</>
					)}
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end" className="w-60" side="right" sideOffset={10}>
					<DropdownMenuLabel className="flex flex-col gap-0.5 py-2">
						<span className="truncate font-semibold text-foreground">{user.name}</span>
						<span className="truncate font-normal text-muted-foreground text-xs">{user.email}</span>
						{user.role ? (
							<span className="mt-1 font-medium text-primary text-xs">{user.role}</span>
						) : null}
					</DropdownMenuLabel>
					{/*
					 * The account links are the mounting app's, not the shell's. The web
					 * workspace has a profile page here; the operator console has no
					 * agency-scoped account to edit, so it supplies none and the group
					 * — and its separator — simply do not render.
					 */}
					{accountLinks === undefined || accountLinks.length === 0 ? null : (
						<>
							<DropdownMenuSeparator />
							<DropdownMenuGroup>
								{accountLinks.map((link) => {
									const LinkIcon = link.icon;
									return (
										<DropdownMenuItem key={link.to} onSelect={() => onNavigate(link.to)}>
											{LinkIcon ? <LinkIcon aria-hidden="true" /> : null}
											{link.label}
										</DropdownMenuItem>
									);
								})}
							</DropdownMenuGroup>
						</>
					)}
					{onSignOut ? (
						<>
							<DropdownMenuSeparator />
							<DropdownMenuItem onSelect={onSignOut} variant="destructive">
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
