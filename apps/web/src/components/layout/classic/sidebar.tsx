import { ScrollArea } from '@simmer-mosquito/ui-web/components/ui/scroll-area';
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
} from '@simmer-mosquito/ui-web/components/ui/sidebar';
import { isActivePath } from '../shared/active';
import { navigationGroups } from '../shared/nav';

/**
 * Classic console sidebar: a fixed, always-visible left rail with grouped
 * navigation. The most familiar, information-dense option.
 */
export function ClassicSidebar({ activePath = '/' }: { readonly activePath?: string }) {
	return (
		<Sidebar
			className="bg-(--app-chrome) shadow-[inset_-14px_0_22px_-24px_oklch(36%_0.024_205/55%)]"
			collapsible="none"
			aria-label="Primary"
		>
			<SidebarHeader className="min-h-[74px] justify-center bg-[linear-gradient(180deg,color-mix(in_oklch,var(--app-chrome-strong)_36%,var(--app-chrome)),var(--app-chrome))] p-3">
				<SidebarMenu>
					<SidebarMenuItem>
						<SidebarMenuButton size="lg" tooltip="SIMMER">
							<span className="inline-flex min-h-[42px] items-center gap-2.5 font-extrabold text-(--simmer-darker-green)">
								<img src="/favicon.svg" alt="" className="block size-[30px] rounded-sm" />
								<span>SIMMER</span>
							</span>
						</SidebarMenuButton>
					</SidebarMenuItem>
				</SidebarMenu>
			</SidebarHeader>
			<ScrollArea className="min-h-0 flex-auto">
				<SidebarContent
					className="flex flex-none flex-col gap-0 overflow-visible px-2 pb-2"
					aria-label="Primary navigation"
				>
					{navigationGroups.map((group) => (
						<SidebarGroup className="gap-1 px-1 py-1.5" key={group.label}>
							<SidebarGroupLabel className="h-[1.65rem] px-2 text-[0.74rem] leading-tight font-extrabold tracking-[0.06em] text-primary uppercase">
								{group.label}
							</SidebarGroupLabel>
							<SidebarGroupContent>
								<SidebarMenu className="gap-0.5">
									{group.items.map((item) => {
										const active = isActivePath(activePath, item.to);
										return (
											<SidebarMenuItem key={item.to}>
												<SidebarMenuButton
													className="h-[1.85rem] px-2 text-[0.86rem] font-semibold text-sidebar-foreground/70 data-[active=true]:bg-(--app-selection) data-[active=true]:shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--primary)_12%,transparent)]"
													isActive={active}
													tooltip={item.label}
												>
													<item.icon aria-hidden="true" />
													<span>{item.label}</span>
												</SidebarMenuButton>
											</SidebarMenuItem>
										);
									})}
								</SidebarMenu>
							</SidebarGroupContent>
						</SidebarGroup>
					))}
				</SidebarContent>
			</ScrollArea>
			<SidebarFooter>
				<div className="mt-auto rounded-md bg-[color-mix(in_oklch,var(--app-chrome-strong)_58%,var(--app-chrome))] p-3">
					<p className="eyebrow">Pattern reserves</p>
					<p className="m-0 text-[0.8rem] leading-normal text-muted-foreground">
						Atlas details and planning grids are preserved for records, routes, and scheduling.
					</p>
				</div>
			</SidebarFooter>
		</Sidebar>
	);
}
