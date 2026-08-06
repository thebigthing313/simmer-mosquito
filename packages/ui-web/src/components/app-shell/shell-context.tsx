import { createContext, useContext, useMemo } from 'react';
import { resolveActive } from './resolve-nav';
import type {
	ShellAccountLink,
	ShellDomain,
	ShellOrganization,
	ShellStandalonePage,
	ShellUser,
} from './types';

/**
 * Everything the shell chrome needs to render, supplied by whoever mounts it.
 * The shell never fetches or routes on its own — it reads this value and calls
 * back out through `onNavigate` / `onSelectOrganization`.
 */
export interface ShellContextValue {
	readonly organizations: readonly ShellOrganization[];
	readonly currentOrganization: ShellOrganization;
	readonly onSelectOrganization: (organizationId: string) => void;
	readonly user: ShellUser;
	/** The navigation as it is *drawn* — already filtered for this account. */
	readonly domains: readonly ShellDomain[];
	/**
	 * The navigation used to answer "where am I", unfiltered. Defaults to
	 * {@link ShellContextValue.domains}.
	 *
	 * The two differ wherever an app hides destinations it still routes to. In
	 * `apps/web` a viewer's sidebar drops every create form, but a viewer who
	 * lands on a form path before the route guard redirects them still needs the
	 * rail and breadcrumbs to say something true — resolving against the drawn
	 * navigation alone would strand them on a page the shell claims not to know.
	 */
	readonly resolutionDomains?: readonly ShellDomain[];
	/** Destinations outside the domain rail that carry their own crumb trail. */
	readonly standalonePages?: readonly ShellStandalonePage[];
	/** Extra entries in the account dropdown, above sign-out. */
	readonly accountLinks?: readonly ShellAccountLink[];
	/** Current location, router-agnostic. Drives active nav + breadcrumbs. */
	readonly activePath: string;
	readonly onNavigate: (to: string) => void;
	/** Optional user-menu hooks; absent actions are simply not shown. */
	readonly onSignOut?: () => void;
	/**
	 * The app's notion of "today", for the header's date. A function rather than a
	 * `Date` so the context value keeps a stable identity across renders — and so
	 * an app that pins today for demos against a data snapshot pins it here too.
	 */
	readonly getToday?: () => Date;
}

const ShellContext = createContext<ShellContextValue | null>(null);

export interface ShellProviderProps extends ShellContextValue {
	readonly children: React.ReactNode;
}

export function ShellProvider({
	children,
	organizations,
	currentOrganization,
	onSelectOrganization,
	user,
	domains,
	resolutionDomains,
	standalonePages,
	accountLinks,
	activePath,
	onNavigate,
	onSignOut,
	getToday,
}: ShellProviderProps) {
	const value = useMemo<ShellContextValue>(
		() => ({
			organizations,
			currentOrganization,
			onSelectOrganization,
			user,
			domains,
			activePath,
			onNavigate,
			...(resolutionDomains ? { resolutionDomains } : {}),
			...(standalonePages ? { standalonePages } : {}),
			...(accountLinks ? { accountLinks } : {}),
			...(onSignOut ? { onSignOut } : {}),
			...(getToday ? { getToday } : {}),
		}),
		[
			organizations,
			currentOrganization,
			onSelectOrganization,
			user,
			domains,
			resolutionDomains,
			standalonePages,
			accountLinks,
			activePath,
			onNavigate,
			onSignOut,
			getToday,
		],
	);

	return <ShellContext.Provider value={value}>{children}</ShellContext.Provider>;
}

export function useShell(): ShellContextValue {
	const context = useContext(ShellContext);
	if (context === null) {
		throw new Error('useShell must be used within a ShellProvider.');
	}

	return context;
}

/** The navigation "where am I" resolves against — unfiltered when an app supplies one. */
export function useResolutionDomains(): readonly ShellDomain[] {
	const { domains, resolutionDomains } = useShell();
	return resolutionDomains ?? domains;
}

/** Active domain + item derived from the current path. */
export function useActiveShellLocation(): ReturnType<typeof resolveActive> {
	const { activePath } = useShell();
	const domains = useResolutionDomains();
	return useMemo(() => resolveActive(domains, activePath), [domains, activePath]);
}

/** Convenience accessor used by the primary rail's active indicator. */
export function useActiveDomainIndex(): number {
	const { domains } = useShell();
	const { domain } = useActiveShellLocation();
	return domains.findIndex((candidate) => candidate.id === domain.id);
}

export type { ShellDomain } from './types';
