import { createContext, useContext } from 'react';
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
	/**
	 * The running build, drawn under the brand mark as a link to the changelog.
	 *
	 * Absent in surfaces that have no release identity of their own (the design
	 * preview app), in which case the rail simply shows no version rather than a
	 * placeholder that would be a lie in a screenshot.
	 */
	readonly version?: string;
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
	/**
	 * The zone "today" is read in — the organization's, where there is one.
	 *
	 * The header's date is the same operational day the rest of the app filters
	 * by, so it has to be resolved the same way. Left undefined the browser
	 * answers, which is right for surfaces with no organization behind them (the
	 * design preview app, the operator console) and wrong for every organization
	 * page.
	 */
	readonly timeZone?: string;
}

const ShellContext = createContext<ShellContextValue | null>(null);

export interface ShellProviderProps extends ShellContextValue {
	readonly children: React.ReactNode;
}

/**
 * The context value, with the optional halves left off rather than set to
 * `undefined`, which is what `exactOptionalPropertyTypes` asks for.
 *
 * A plain function rather than the body of a `useMemo`, which is what it was
 * until the compiler took the memoizing over. Its seven conditional spreads
 * belong to a function of their own either way: inside the component they read
 * as the provider's own branching, which is not what they are.
 */
const shellContextValue = ({
	organizations,
	currentOrganization,
	onSelectOrganization,
	user,
	domains,
	resolutionDomains,
	standalonePages,
	accountLinks,
	version,
	activePath,
	onNavigate,
	onSignOut,
	getToday,
	timeZone,
}: ShellContextValue): ShellContextValue => ({
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
	...(version ? { version } : {}),
	...(onSignOut ? { onSignOut } : {}),
	...(getToday ? { getToday } : {}),
	...(timeZone ? { timeZone } : {}),
});

export function ShellProvider({ children, ...props }: ShellProviderProps) {
	return (
		<ShellContext.Provider value={shellContextValue(props)}>{children}</ShellContext.Provider>
	);
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
	return resolveActive(domains, activePath);
}

/** Convenience accessor used by the primary rail's active indicator. */
export function useActiveDomainIndex(): number {
	const { domains } = useShell();
	const { domain } = useActiveShellLocation();
	return domains.findIndex((candidate) => candidate.id === domain.id);
}

export type { ShellDomain } from './types';
