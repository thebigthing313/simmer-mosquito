import { useActiveShellLocation, useShell } from '../shell-context';
import type { ShellNavItem } from '../types';
import { SecondarySidebarGroup } from './secondary-sidebar-group';

/** Title + grouped navigation for the active domain. */
export function SecondarySidebarContent() {
	const { domains, onNavigate } = useShell();
	const { domain: activeDomain, item } = useActiveShellLocation();
	const activeItemId = item?.id ?? null;
	// `resolveActive` answers "where am I" against the full navigation, so it can
	// still name the domain of a path the caller does not offer. What gets *drawn*
	// comes from the caller's `domains` — which is how the role-filtered
	// navigation (see `shellDomainsForRole`) actually reaches the sidebar.
	const domain = domains.find((candidate) => candidate.id === activeDomain.id) ?? activeDomain;

	function handleSelect(navItem: ShellNavItem) {
		if (navItem.to !== undefined) {
			onNavigate(navItem.to);
		}
	}

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<div className="px-3 pt-4 pb-2">
				<h2 className="truncate text-base font-bold text-foreground">{domain.label}</h2>
				{/*
				 * The summary wraps rather than truncating. It is one sentence naming
				 * what the domain covers, and a truncated one ("Egg, larval, and pupal
				 * surveil…") answers nothing while still costing the same row.
				 */}
				{domain.summary ? (
					<p className="mt-0.5 text-muted-foreground text-xs leading-snug">{domain.summary}</p>
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
