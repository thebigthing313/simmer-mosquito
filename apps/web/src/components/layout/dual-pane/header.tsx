import { Avatar, AvatarFallback } from '@simmer-mosquito/ui-web/components/ui/avatar';
import { Tabs, TabsList, TabsTrigger } from '@simmer-mosquito/ui-web/components/ui/tabs';
import { Link } from '@tanstack/react-router';
import { demoIdentity } from '../shared/nav';
import { initialsFor } from '../shared/primitives';
import type { LayoutIdentity, PageMeta } from '../shared/types';

/**
 * Dual-pane header: title + identity on top, an optional in-section tab strip
 * along the bottom edge for switching views without leaving the record.
 */
export function DualPaneHeader({
	page,
	identity = demoIdentity,
}: {
	readonly page: PageMeta;
	readonly identity?: LayoutIdentity;
}) {
	const tabs = page.tabs ?? [];
	const [firstTab] = tabs;

	return (
		<header className="sticky top-0 z-10 grid shrink-0 gap-3 border-b border-border/50 bg-card/80 px-5 pt-3 backdrop-blur-sm">
			<div className="flex items-center gap-4">
				<div className="min-w-0">
					<p className="eyebrow">{page.context}</p>
					<h1 className="m-0 truncate text-[1.15rem] leading-tight font-extrabold text-foreground">
						{page.title}
					</h1>
				</div>
				<div className="ml-auto flex items-center gap-3">
					{page.actions}
					<div className="flex items-center gap-2">
						<div className="hidden text-right sm:block">
							<strong className="block text-[0.82rem] leading-tight font-bold text-foreground">
								{identity.profileName}
							</strong>
							<span className="block text-[0.72rem] leading-tight text-muted-foreground">
								{identity.organizationName}
							</span>
						</div>
						<Avatar size="sm" className="bg-(--app-selection) text-primary">
							<AvatarFallback>{initialsFor(identity.profileName)}</AvatarFallback>
						</Avatar>
					</div>
				</div>
			</div>
			{firstTab === undefined ? (
				<div className="h-2" />
			) : (
				<Tabs
					{...(page.activeTab === undefined
						? { defaultValue: firstTab.label }
						: { value: page.activeTab })}
				>
					<TabsList
						variant="line"
						className="h-9 w-full justify-start overflow-x-auto p-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
					>
						{tabs.map((tab) => (
							<TabsTrigger
								key={tab.label}
								value={tab.label}
								className="min-w-max flex-none px-3"
								asChild={tab.to !== undefined}
							>
								{tab.to === undefined ? (
									<span>{tab.label}</span>
								) : (
									<Link to={tab.to}>{tab.label}</Link>
								)}
							</TabsTrigger>
						))}
					</TabsList>
				</Tabs>
			)}
		</header>
	);
}
