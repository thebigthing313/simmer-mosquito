import { useActiveShellLocation, useShell } from '../shell-context';
import type { ShellNavItem } from '../types';
import { SecondarySidebarGroup } from './secondary-sidebar-group';

/** Title + grouped navigation for the active domain. */
export function SecondarySidebarContent() {
	const { onNavigate } = useShell();
	const { domain, item } = useActiveShellLocation();
	const activeItemId = item?.id ?? null;

	function handleSelect(navItem: ShellNavItem) {
		if (navItem.to !== undefined) {
			onNavigate(navItem.to);
		}
	}

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<div className="px-3 pt-4 pb-2">
				<h2 className="truncate text-base font-bold text-foreground">{domain.label}</h2>
				{domain.summary ? (
					<p className="mt-0.5 truncate text-xs text-muted-foreground">{domain.summary}</p>
				) : null}
			</div>
			<nav
				aria-label={domain.label}
				className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-2 pt-1 pb-3"
			>
				{domain.groups.map((group) => (
					<SecondarySidebarGroup
						key={group.id}
						group={group}
						activeItemId={activeItemId}
						onSelect={handleSelect}
					/>
				))}
			</nav>
		</div>
	);
}
