import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarRail,
} from '@simmer-mosquito/ui-web/components/ui/sidebar';
import { isActivePath } from '../shared/active';
import { navigationGroups } from '../shared/nav';

/**
 * Collapsible icon rail: expands to labelled groups, collapses to an icon-only
 * rail (Ctrl/Cmd+B or the trigger). Tooltips surface labels while collapsed.
 */
export function RailSidebar({ activePath = '/' }: { readonly activePath?: string }) {
	return (
		<Sidebar collapsible="icon" aria-label="Primary">
			<SidebarHeader>
				<SidebarMenu>
					<SidebarMenuItem>
						<SidebarMenuButton size="lg" tooltip="SIMMER">
							<img src="/favicon.svg" alt="" className="block size-6 rounded-sm" />
							<span className="font-extrabold text-(--simmer-darker-green)">SIMMER</span>
						</SidebarMenuButton>
					</SidebarMenuItem>
				</SidebarMenu>
			</SidebarHeader>
			<SidebarContent>
				{navigationGroups.map((group) => (
					<SidebarGroup key={group.label}>
						<SidebarGroupLabel>{group.label}</SidebarGroupLabel>
						<SidebarGroupContent>
							<SidebarMenu>
								{group.items.map((item) => (
									<SidebarMenuItem key={item.to}>
										<SidebarMenuButton
											isActive={isActivePath(activePath, item.to)}
											tooltip={item.label}
										>
											<item.icon aria-hidden="true" />
											<span>{item.label}</span>
										</SidebarMenuButton>
									</SidebarMenuItem>
								))}
							</SidebarMenu>
						</SidebarGroupContent>
					</SidebarGroup>
				))}
			</SidebarContent>
			<SidebarFooter>
				<SidebarMenu>
					<SidebarMenuItem>
						<SidebarMenuButton tooltip="Settings">
							<img src="/favicon.svg" alt="" className="block size-4 rounded-xs opacity-0" />
							<span className="text-[0.82rem] text-muted-foreground">v1 preview</span>
						</SidebarMenuButton>
					</SidebarMenuItem>
				</SidebarMenu>
			</SidebarFooter>
			<SidebarRail />
		</Sidebar>
	);
}
