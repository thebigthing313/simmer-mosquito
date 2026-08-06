/**
 * The SIMMER application shell: a primary rail of operational domains, a
 * secondary panel of that domain's navigation, a breadcrumb header, and the
 * scrolling region a router renders into.
 *
 * Everything here is app-agnostic on purpose. The chrome fetches nothing and
 * routes nothing — it reads {@link ShellContextValue} and calls back out — which
 * is what lets the agency workspace (`apps/web`) and the operator console
 * (`apps/admin`) wear the same shell over completely different navigation,
 * identity, and data.
 *
 * A mounting app supplies three things: a navigation model built from
 * {@link ShellDomain}, the identity to show in the switcher and account menu,
 * and an `onNavigate` adapter to its router.
 */

export {
	BreadcrumbLabelProvider,
	useBreadcrumbLabel,
	useBreadcrumbLabels,
} from './breadcrumb-labels';
export { OutletContentFallback } from './outlet/outlet-content-fallback';
export { OutletShell } from './outlet/outlet-shell';
export { OutletSimpleLayout } from './outlet/simple-layout';
export {
	buildBreadcrumbs,
	firstDestination,
	flattenNavItems,
	pathMatches,
	resolveActive,
} from './resolve-nav';
export {
	type ShellContextValue,
	ShellProvider,
	type ShellProviderProps,
	useActiveDomainIndex,
	useActiveShellLocation,
	useResolutionDomains,
	useShell,
} from './shell-context';
export type {
	ShellAccountLink,
	ShellCrumb,
	ShellDomain,
	ShellNavGroup,
	ShellNavItem,
	ShellOrganization,
	ShellStandalonePage,
	ShellUser,
} from './types';
