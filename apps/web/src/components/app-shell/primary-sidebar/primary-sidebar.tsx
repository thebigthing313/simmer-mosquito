import { PrimarySidebarContent } from './primary-sidebar-content';
import { PrimarySidebarFooter } from './primary-sidebar-footer';
import { PrimarySidebarHeader } from './primary-sidebar-header';

/**
 * The slim, icon-only rail for the app's top-level domains. Brand at the top,
 * domain switcher in the middle, account at the foot. Always visible on desktop;
 * the secondary sidebar to its right carries the labelled navigation.
 */
export function PrimarySidebar() {
	return (
		<aside
			aria-label="Primary"
			className="flex h-full w-16 shrink-0 flex-col border-r border-white/10 bg-simmer-green-900"
		>
			<PrimarySidebarHeader />
			<PrimarySidebarContent />
			<PrimarySidebarFooter />
		</aside>
	);
}
