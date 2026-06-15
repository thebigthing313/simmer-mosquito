import { ScrollArea } from '@simmer-mosquito/ui-web/components/ui/scroll-area';
import { SidebarInset, SidebarProvider } from '@simmer-mosquito/ui-web/components/ui/sidebar';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import type React from 'react';
import type { PageMeta } from '../shared/types';
import { RailHeader } from './header';
import { RailSidebar } from './sidebar';

/**
 * Composition seam for the command-bar design: collapsible icon rail + command
 * bar + routed page body. `fullBleed` gives map-driven pages an edge-to-edge,
 * non-scrolling stage.
 */
export function RailShell({
	page,
	activePath = '/',
	fullBleed = false,
	children,
}: {
	readonly page: PageMeta;
	readonly activePath?: string;
	readonly fullBleed?: boolean;
	readonly children: React.ReactNode;
}) {
	const body = (
		<div
			className={cn('min-h-0', fullBleed ? 'h-full overflow-hidden' : 'p-[clamp(16px,2.4vw,28px)]')}
		>
			{children}
		</div>
	);

	return (
		<SidebarProvider className="h-svh min-h-0 overflow-hidden">
			<RailSidebar activePath={activePath} />
			<SidebarInset className="h-svh min-h-0 min-w-0 overflow-hidden bg-(--app-stage)">
				<RailHeader page={page} />
				{fullBleed ? (
					<div className="min-h-0 flex-auto overflow-hidden">{body}</div>
				) : (
					<ScrollArea className="min-h-0 flex-auto">{body}</ScrollArea>
				)}
			</SidebarInset>
		</SidebarProvider>
	);
}
