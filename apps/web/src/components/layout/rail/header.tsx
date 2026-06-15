import { Avatar, AvatarFallback } from '@simmer-mosquito/ui-web/components/ui/avatar';
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from '@simmer-mosquito/ui-web/components/ui/breadcrumb';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '@simmer-mosquito/ui-web/components/ui/dropdown-menu';
import { Input } from '@simmer-mosquito/ui-web/components/ui/input';
import { Separator } from '@simmer-mosquito/ui-web/components/ui/separator';
import { SidebarTrigger } from '@simmer-mosquito/ui-web/components/ui/sidebar';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { demoIdentity } from '../shared/nav';
import { initialsFor } from '../shared/primitives';
import type { PageMeta } from '../shared/types';

const SearchIcon = iconRegistry.actions.search.icon;

/**
 * Command bar: sidebar trigger, breadcrumb trail, global search, and an identity
 * menu. The header carries wayfinding so the rail can stay icon-only.
 */
export function RailHeader({ page }: { readonly page: PageMeta }) {
	return (
		<header className="sticky top-0 z-10 flex h-16 shrink-0 items-center gap-3 border-b border-border/50 bg-card/80 px-4 backdrop-blur-sm">
			<SidebarTrigger className="size-8" />
			<Separator orientation="vertical" className="mr-1 h-6" />
			<Breadcrumb className="min-w-0">
				<BreadcrumbList>
					<BreadcrumbItem className="max-[700px]:hidden">
						<BreadcrumbLink>{page.context}</BreadcrumbLink>
					</BreadcrumbItem>
					<BreadcrumbSeparator className="max-[700px]:hidden" />
					<BreadcrumbItem>
						<BreadcrumbPage className="truncate font-semibold">{page.title}</BreadcrumbPage>
					</BreadcrumbItem>
				</BreadcrumbList>
			</Breadcrumb>
			<div className="relative ml-auto hidden w-full max-w-xs min-[820px]:block">
				<SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
				<Input
					className="h-9 bg-background/70 pl-8"
					placeholder="Search records, places, requests…"
					aria-label="Search"
				/>
			</div>
			{page.actions === undefined ? null : <div className="shrink-0">{page.actions}</div>}
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button variant="ghost" className="h-9 gap-2 px-1.5">
						<Avatar size="sm" className="bg-(--app-selection) text-primary">
							<AvatarFallback>{initialsFor(demoIdentity.profileName)}</AvatarFallback>
						</Avatar>
						<span className="hidden text-[0.84rem] font-semibold min-[700px]:inline">
							{demoIdentity.profileName}
						</span>
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end" className="w-56">
					<DropdownMenuLabel>
						<div className="grid gap-0.5">
							<span className="font-semibold">{demoIdentity.profileName}</span>
							<span className="text-[0.78rem] font-normal text-muted-foreground">
								{demoIdentity.organizationName}
							</span>
						</div>
					</DropdownMenuLabel>
					<DropdownMenuSeparator />
					<DropdownMenuItem>Profile</DropdownMenuItem>
					<DropdownMenuItem>Organization settings</DropdownMenuItem>
					<DropdownMenuSeparator />
					<DropdownMenuItem>Sign out</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		</header>
	);
}
