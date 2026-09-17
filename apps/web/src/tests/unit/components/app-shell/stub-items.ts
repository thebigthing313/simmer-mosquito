import type { WebShellDomain, WebShellNavItem } from '../../../../components/app-shell/navigation';

/**
 * The sidebar's unbuilt destinations, the `stub: true` items across every
 * domain, read off the register rather than counted in prose (#1097).
 *
 * The navigation suite maps ids off this and the upcoming-page suite maps
 * paths; neither walks the tree itself.
 */
export function stubItems(domains: readonly WebShellDomain[]): readonly WebShellNavItem[] {
	return domains
		.flatMap((domain) => domain.groups)
		.flatMap((group) => group.items)
		.filter((item) => item.stub === true);
}
