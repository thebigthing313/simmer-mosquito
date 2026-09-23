import type { WebShellDomain, WebShellNavItem } from '../../../../components/app-shell/navigation';

/**
 * Every item in the sidebar register, domains to groups to items, as one flat
 * list. The two app-shell suites read the tree through this and never walk it
 * themselves: six copies of the same three-step walk were sitting across the
 * web suites when #1126 counted them, and a walk written at each call site is
 * where a renamed level goes stale one file at a time.
 */
export function shellItems(domains: readonly WebShellDomain[]): readonly WebShellNavItem[] {
	return domains.flatMap((domain) => domain.groups).flatMap((group) => group.items);
}

/**
 * The sidebar's unbuilt destinations, the `stub: true` items across every
 * domain, read off the register rather than counted in prose (#1097).
 *
 * The navigation suite maps ids off this and the upcoming-page suite maps
 * paths; neither walks the tree itself.
 */
export function stubItems(domains: readonly WebShellDomain[]): readonly WebShellNavItem[] {
	return shellItems(domains).filter((item) => item.stub === true);
}
