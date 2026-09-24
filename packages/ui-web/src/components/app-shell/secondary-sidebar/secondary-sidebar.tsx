import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { SecondarySidebarContent } from './secondary-sidebar-content';
import { SecondarySidebarHeader } from './secondary-sidebar-header';

/**
 * The labelled navigation panel beside the rail. It carries the organization
 * switcher and the active domain's sub-navigation, and is the surface that
 * changes most as the operator moves between domains.
 */
export function SecondarySidebar({ className }: { readonly className?: string | undefined } = {}) {
	return (
		<aside
			aria-label="Secondary"
			className={cn(
				'flex h-full w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar',
				className,
			)}
		>
			<SecondarySidebarHeader />
			<SecondarySidebarContent />
		</aside>
	);
}
