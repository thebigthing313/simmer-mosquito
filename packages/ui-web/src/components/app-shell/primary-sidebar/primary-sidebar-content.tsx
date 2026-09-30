import { ScrollArea } from '@simmer-mosquito/ui-web/components/ui/scroll-area';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { firstDestination } from '../resolve-nav';
import { useActiveShellLocation, useShell } from '../shell-context';
import type { ShellDomain } from '../types';
import { PrimarySidebarActiveIndicator } from './primary-sidebar-active-indicator';
import { AppShellPrimarySidebarIcon } from './primary-sidebar-icon';

/** The domain switcher: one entry per domain, with the active indicator overlaid. */
export function PrimarySidebarContent({ collapsed }: { readonly collapsed: boolean }) {
	const { domains, onNavigate } = useShell();
	const { domain: activeDomain } = useActiveShellLocation();

	function handleSelect(domain: ShellDomain) {
		const destination = firstDestination(domain);
		if (destination !== null && destination !== undefined) {
			onNavigate(destination);
		}
	}

	return (
		<nav aria-label="Domains" className="flex min-h-0 flex-1 flex-col">
			{/*
			 * The list scrolls inside the shared ScrollArea so a long one draws the
			 * styled bar rather than the browser's. The indicator is positioned
			 * against the list inside the viewport, not against the nav, so it
			 * scrolls with the buttons it marks.
			 *
			 * The indicator also sits at the rail's right edge, so the bar is moved
			 * in by the indicator's 3px width to keep the thumb off it (#1278). Radix
			 * pins the bar with an inline `right: 0`, which a class cannot override,
			 * so the inset is a right margin on the scrollbar slot instead.
			 */}
			<ScrollArea
				className="min-h-0 flex-1 [&>[data-slot=scroll-area-scrollbar]]:mr-[3px]"
				type="auto"
			>
				<div
					className={cn('relative flex flex-col gap-1.5 py-3', collapsed ? 'items-center' : 'px-3')}
				>
					<PrimarySidebarActiveIndicator />
					{domains.map((domain) => (
						<AppShellPrimarySidebarIcon
							active={domain.id === activeDomain.id}
							collapsed={collapsed}
							domain={domain}
							key={domain.id}
							onSelect={handleSelect}
						/>
					))}
				</div>
			</ScrollArea>
		</nav>
	);
}
