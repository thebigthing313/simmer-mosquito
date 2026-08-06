import { SecondarySidebarContent } from './secondary-sidebar-content';
import { SecondarySidebarHeader } from './secondary-sidebar-header';

/**
 * The labelled navigation panel beside the rail. It carries the organization
 * switcher and the active domain's sub-navigation, and is the surface that
 * changes most as the operator moves between domains.
 */
export function SecondarySidebar() {
	return (
		<aside
			aria-label="Secondary"
			className="flex h-full w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar"
		>
			<SecondarySidebarHeader />
			<SecondarySidebarContent />
		</aside>
	);
}
