import {
	Sidebar,
	SidebarContent,
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
} from '@simmer-mosquito/ui-web/components/ui/sidebar';
import { Link } from '@tanstack/react-router';
import { isActivePath } from '../shared/active';
import { navigationGroups } from '../shared/nav';

/**
 * Dual-pane primary nav: a compact, always-visible rail with real router links.
 * It is deliberately narrow because map workspaces keep a second context pane
 * to its right.
 */
export function DualPaneSidebar({ activePath = '/' }: { readonly activePath?: string }) {
	return (
		<Sidebar
			collapsible="none"
			aria-label="Primary"
			className="w-[13.5rem] border-r border-sidebar-border bg-sidebar"
		>
			<SidebarHeader className="h-16 justify-center border-b border-sidebar-border px-3">
				<Link
					to="/"
					className="inline-flex items-center gap-2 font-extrabold text-(--simmer-darker-green) no-underline"
				>
					<img src="/favicon.svg" alt="" className="block size-6 rounded-sm" />
					SIMMER
				</Link>
			</SidebarHeader>
			<SidebarContent className="px-1.5 py-2">
				{navigationGroups.map((group) => (
					<SidebarGroup key={group.label} className="py-1">
						<SidebarGroupLabel className="text-[0.7rem] font-bold tracking-[0.05em] text-muted-foreground uppercase">
							{group.label}
						</SidebarGroupLabel>
						<SidebarGroupContent>
							<SidebarMenu>
								{group.items.map((item) => {
									const active = isActivePath(activePath, item.to);

									return (
										<SidebarMenuItem key={item.to}>
											<SidebarMenuButton asChild size="sm" isActive={active} tooltip={item.label}>
												<Link aria-current={active ? 'page' : undefined} to={item.to}>
													<item.icon aria-hidden="true" />
													<span>{item.label}</span>
												</Link>
											</SidebarMenuButton>
										</SidebarMenuItem>
									);
								})}
							</SidebarMenu>
						</SidebarGroupContent>
					</SidebarGroup>
				))}
			</SidebarContent>
		</Sidebar>
	);
}
