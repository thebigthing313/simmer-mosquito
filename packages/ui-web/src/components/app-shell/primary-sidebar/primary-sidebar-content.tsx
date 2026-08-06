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
		<nav
			aria-label="Domains"
			className={cn(
				'relative flex flex-1 flex-col gap-1.5 overflow-y-auto py-3',
				collapsed ? 'items-center' : 'px-3',
			)}
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
		</nav>
	);
}
