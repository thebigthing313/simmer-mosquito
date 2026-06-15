import { ScrollArea } from '@simmer-mosquito/ui-web/components/ui/scroll-area';
import { SidebarInset, SidebarProvider } from '@simmer-mosquito/ui-web/components/ui/sidebar';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import type React from 'react';
import { demoIdentity } from '../shared/nav';
import type { LayoutIdentity, PageMeta } from '../shared/types';
import { DualPaneHeader } from './header';
import { DualPaneSidebar } from './sidebar';

/**
 * Composition seam for the dual-pane workspace: compact nav + an optional
 * context/list pane (`aside`) + the main region. When `aside` is omitted the
 * main region spans the full width (the no-map layout used across the app).
 * `fullBleed` lets the main region host an edge-to-edge map.
 */
export function DualPaneShell({
	page,
	activePath = '/',
	identity = demoIdentity,
	aside,
	fullBleed = false,
	children,
}: {
	readonly page: PageMeta;
	readonly activePath?: string;
	readonly identity?: LayoutIdentity;
	readonly aside?: React.ReactNode;
	readonly fullBleed?: boolean;
	readonly children: React.ReactNode;
}) {
	const main = fullBleed ? (
		<div className="min-h-0 overflow-hidden">{children}</div>
	) : (
		<ScrollArea className="min-h-0">
			<div className="p-[clamp(16px,2.2vw,26px)]">{children}</div>
		</ScrollArea>
	);

	return (
		<SidebarProvider className="h-svh min-h-0 overflow-hidden">
			<DualPaneSidebar activePath={activePath} />
			<SidebarInset className="h-svh min-h-0 min-w-0 overflow-hidden bg-(--app-stage)">
				<DualPaneHeader page={page} identity={identity} />
				<div
					className={cn(
						'grid min-h-0 flex-auto',
						aside === undefined
							? 'grid-cols-1'
							: 'grid-cols-[minmax(300px,0.34fr)_minmax(0,1fr)] max-[900px]:grid-cols-1',
					)}
				>
					{aside === undefined ? null : (
						<aside className="min-h-0 border-r border-border/40 bg-card/60 max-[900px]:hidden">
							<ScrollArea className="h-full">{aside}</ScrollArea>
						</aside>
					)}
					{main}
				</div>
			</SidebarInset>
		</SidebarProvider>
	);
}
