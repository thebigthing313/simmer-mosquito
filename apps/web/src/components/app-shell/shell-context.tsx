import { createContext, useContext, useMemo } from 'react';
import { resolveActive } from './navigation';
import type { ShellDomain, ShellOrganization, ShellUser } from './types';

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
	readonly domains: readonly ShellDomain[];
	/** Current location, router-agnostic. Drives active nav + breadcrumbs. */
	readonly activePath: string;
	readonly onNavigate: (to: string) => void;
	/** Optional user-menu hooks; absent actions are simply not shown. */
	readonly onSignOut?: () => void;
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
	activePath,
	onNavigate,
	onSignOut,
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
			...(onSignOut ? { onSignOut } : {}),
		}),
		[
			organizations,
			currentOrganization,
			onSelectOrganization,
			user,
			domains,
			activePath,
			onNavigate,
			onSignOut,
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

/** Active domain + item derived from the current path. */
export function useActiveShellLocation(): ReturnType<typeof resolveActive> {
	const { activePath } = useShell();
	return useMemo(() => resolveActive(activePath), [activePath]);
}

/** Convenience accessor used by the primary rail's active indicator. */
export function useActiveDomainIndex(): number {
	const { domains } = useShell();
	const { domain } = useActiveShellLocation();
	return domains.findIndex((candidate) => candidate.id === domain.id);
}

export type { ShellDomain, ShellNavItem } from './types';
