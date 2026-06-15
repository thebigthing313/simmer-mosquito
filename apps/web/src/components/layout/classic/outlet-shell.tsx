import { ScrollArea } from '@simmer-mosquito/ui-web/components/ui/scroll-area';
import { SidebarInset, SidebarProvider } from '@simmer-mosquito/ui-web/components/ui/sidebar';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import type React from 'react';
import type { PageMeta } from '../shared/types';
import { ClassicHeader } from './header';
import { ClassicSidebar } from './sidebar';

/**
 * Composition seam for the classic console: fixed sidebar + sticky header + the
 * routed page body. `fullBleed` switches the content region from a scroll area
 * (forms, dashboards) to an overflow-hidden full-height stage (map-driven pages).
 */
export function ClassicShell({
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
	const stageClass =
		'bg-[linear-gradient(90deg,color-mix(in_oklch,var(--app-shell)_58%,transparent),transparent_340px),var(--app-stage)]';
	const body = (
		<div
			className={cn(
				'min-h-0 p-[clamp(18px,2.6vw,30px)] max-[560px]:p-4',
				fullBleed ? 'h-full overflow-hidden' : 'h-full',
			)}
		>
			{children}
		</div>
	);

	return (
		<SidebarProvider className="h-svh min-h-0 overflow-hidden bg-(--app-stage)">
			<ClassicSidebar activePath={activePath} />
			<SidebarInset className="h-svh min-h-0 min-w-0 overflow-hidden bg-(--app-stage)">
				<ClassicHeader page={page} />
				{fullBleed ? (
					<div className={cn('min-h-0 flex-auto overflow-hidden', stageClass)}>{body}</div>
				) : (
					<ScrollArea className={cn('min-h-0 flex-auto', stageClass)}>{body}</ScrollArea>
				)}
			</SidebarInset>
		</SidebarProvider>
	);
}
