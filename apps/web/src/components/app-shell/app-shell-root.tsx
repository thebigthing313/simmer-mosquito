import {
	BreadcrumbLabelProvider,
	OutletContentFallback,
	OutletShell,
	SearchTriggerProvider,
	type ShellOrganization,
	ShellProvider,
	type ShellUser,
} from '@simmer-mosquito/ui-web/components/app-shell';
import { EnvironmentBanner } from '@simmer-mosquito/ui-web/components/environment-banner';
import { Toaster } from '@simmer-mosquito/ui-web/components/ui/sonner';
import { useLiveQuery } from '@tanstack/react-db';
import { Outlet, useLocation, useNavigate } from '@tanstack/react-router';
import { Suspense, useRef, useState } from 'react';
import { type AuthMe, getServerUrl } from '../../auth';
import { useProfileNames } from '../../hooks/queries/use-profile-names';
import { useOrganizationTimeZone } from '../../hooks/use-organization-time-zone';
import { organizations } from '../../lib/collections/organizations';
import { getToday } from '../../lib/get-today';
import { SearchPalette } from '../search/search-palette';
import {
	shellDomainsForRole,
	webAccountLinks,
	webShellDomains,
	webStandalonePages,
} from './navigation';

function formatRole(role: string | null | undefined): string {
	if (role === null || role === undefined || role.trim() === '') {
		return 'Member';
	}

	return role
		.split(/[_-]/g)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(' ');
}

/**
 * Wires the app shell to live data: auth identity + synced organization/profile
 * collections supply the chrome, TanStack Router supplies the active path and
 * navigation, and the router `Outlet` renders into the shell's main region.
 */
export function AppShellRoot({ auth }: { readonly auth: AuthMe | null }) {
	const navigate = useNavigate();
	const { pathname } = useLocation();
	// The palette is mounted here, beside the shell, because `AppHeader` takes no
	// props and renders the trigger itself. `apps/admin` provides no such context,
	// so its header simply loses the search field it never had a palette for.
	const [searchOpen, setSearchOpen] = useState(false);
	const searchTriggerRef = useRef<HTMLButtonElement>(null);
	const localIdentity = auth?.authenticated === true ? auth.localIdentity : null;
	const user = auth?.authenticated === true ? auth.user : null;

	// The chrome renders from the auth snapshot first and refines as sync lands:
	// non-suspense `useLiveQuery` gated on `isReady`, NOT `useLiveSuspenseQuery`,
	// so a cold organization/profile shape never holds the entire workspace
	// behind a full-screen fallback. Route content suspends into the boundary
	// around `Outlet` below instead.
	const organizationResult = useLiveQuery((query) => query.from({ row: organizations() }), []);
	const profileNameById = useProfileNames();
	const timeZone = useOrganizationTimeZone();

	const organization = (organizationResult.data ?? []).find(
		(row) => row.id === localIdentity?.organizationId,
	);
	if (organizationResult.isReady && localIdentity !== null && organization === undefined) {
		throw new Error('Unable to resolve active organization for this workspace.');
	}
	const profileId = localIdentity?.profileId ?? null;
	const profileName = profileId === null ? undefined : profileNameById.get(profileId);

	const currentOrganization: ShellOrganization = {
		id: organization?.id ?? localIdentity?.organizationId ?? 'organization',
		// `organizationName` rides on the auth snapshot, so the real name is on
		// screen before the organization shape syncs — no placeholder flash.
		name: organization?.name ?? localIdentity?.organizationName ?? 'Organization',
	};
	const shellUser: ShellUser = {
		name: profileName ?? user?.displayName ?? 'SIMMER User',
		email: user?.email ?? '',
		role: formatRole(localIdentity?.role),
	};

	return (
		<SearchTriggerProvider
			value={{
				isOpen: searchOpen,
				onOpen: () => setSearchOpen(true),
				triggerRef: searchTriggerRef,
			}}
		>
			<ShellProvider
				organizations={[currentOrganization]}
				currentOrganization={currentOrganization}
				onSelectOrganization={() => undefined}
				user={shellUser}
				domains={shellDomainsForRole(auth)}
				// Unfiltered, so a viewer who lands on a form path still gets a true
				// rail and breadcrumb before the route guard redirects them.
				resolutionDomains={webShellDomains}
				standalonePages={webStandalonePages}
				accountLinks={webAccountLinks}
				version={__APP_VERSION__}
				getToday={getToday}
				timeZone={timeZone}
				activePath={pathname}
				onNavigate={(to) => {
					// The shell models destinations as plain strings; the router's typed
					// `to` is satisfied by an assertion at this single adapter seam.
					navigate({ to: to as never });
				}}
				onSignOut={() => {
					window.location.href = `${getServerUrl()}/auth/logout`;
				}}
			>
				<BreadcrumbLabelProvider>
					<OutletShell
						banner={<EnvironmentBanner environment={import.meta.env.VITE_SIMMER_ENVIRONMENT} />}
					>
						{/* Backstop only. Route pages suspend into the per-match boundary the
						    router builds from `defaultPendingComponent` (see main.tsx); this
						    one catches anything that suspends outside a match. Deliberately
						    unkeyed — keying it would remount every page on navigation. */}
						<Suspense fallback={<OutletContentFallback />}>
							<Outlet />
						</Suspense>
					</OutletShell>
				</BreadcrumbLabelProvider>
			</ShellProvider>
			<SearchPalette
				auth={auth}
				onOpenChange={setSearchOpen}
				open={searchOpen}
				triggerRef={searchTriggerRef}
			/>
			<Toaster richColors />
		</SearchTriggerProvider>
	);
}
