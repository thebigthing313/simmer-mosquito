import { firstDestination } from '../navigation';
import { useActiveShellLocation, useShell } from '../shell-context';
import type { ShellDomain } from '../types';
import { PrimarySidebarActiveIndicator } from './primary-sidebar-active-indicator';
import { AppShellPrimarySidebarIcon } from './primary-sidebar-icon';

/** The domain switcher: one icon per domain, with the active indicator overlaid. */
export function PrimarySidebarContent() {
	const { domains, onNavigate } = useShell();
	const { domain: activeDomain } = useActiveShellLocation();

	function handleSelect(domain: ShellDomain) {
		const destination = firstDestination(domain);
		if (destination !== null) {
			onNavigate(destination);
		}
	}

	return (
		<nav
			aria-label="Domains"
			className="relative flex flex-1 flex-col items-center gap-1.5 overflow-y-auto py-3"
		>
			<PrimarySidebarActiveIndicator />
			{domains.map((domain) => (
				<AppShellPrimarySidebarIcon
					key={domain.id}
					domain={domain}
					active={domain.id === activeDomain.id}
					onSelect={handleSelect}
				/>
			))}
		</nav>
	);
}
