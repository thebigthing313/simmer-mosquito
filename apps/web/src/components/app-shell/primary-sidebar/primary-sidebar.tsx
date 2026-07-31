import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { usePersistentFlag } from '../../../hooks/use-persistent-flag';
import { PrimarySidebarContent } from './primary-sidebar-content';
import { PrimarySidebarFooter } from './primary-sidebar-footer';
import { PrimarySidebarHeader } from './primary-sidebar-header';
import { PrimarySidebarToggle } from './primary-sidebar-toggle';

const COLLAPSED_KEY = 'simmer.shell.primary-sidebar-collapsed';

/**
 * The rail for the app's top-level domains. Brand at the top, domain switcher in
 * the middle, account at the foot; the secondary sidebar to its right carries the
 * active domain's navigation.
 *
 * It defaults to **expanded** with labels showing. The icon-only form is denser
 * and reads better once the domain icons are learned, but nobody arrives knowing
 * them — an unlabelled rail is legible only to someone who has already used it.
 * Collapsing is therefore opt-in, and the choice is remembered per browser.
 */
export function PrimarySidebar() {
	const [collapsed, setCollapsed] = usePersistentFlag(COLLAPSED_KEY, false);

	return (
		<aside
			aria-label="Primary"
			className={cn(
				'flex h-full shrink-0 flex-col border-white/10 border-r bg-simmer-green-900',
				'transition-[width] duration-(--simmer-motion-standard) ease-(--simmer-ease-out) motion-reduce:transition-none',
				collapsed ? 'w-16' : 'w-60',
			)}
		>
			<PrimarySidebarHeader collapsed={collapsed} />
			<PrimarySidebarContent collapsed={collapsed} />
			<PrimarySidebarToggle collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
			<PrimarySidebarFooter collapsed={collapsed} />
		</aside>
	);
}
