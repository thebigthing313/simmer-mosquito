import { Toaster } from '@simmer-mosquito/ui-web/components/ui/sonner';
import { Outlet, useLocation, useNavigate } from '@tanstack/react-router';
import { type AuthMe, getServerUrl } from '../../auth';
import { useCollectionRows } from '../../hooks/use-collection-rows';
import { webCollections } from '../../sync/webCollections';
import { shellDomains } from './navigation';
import { OutletShell } from './outlet/outlet-shell';
import { ShellProvider } from './shell-context';
import type { ShellOrganization, ShellUser } from './types';

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
	const localIdentity = auth?.authenticated === true ? auth.localIdentity : null;
	const user = auth?.authenticated === true ? auth.user : null;

	const { rows: organizations, status: organizationStatus } = useCollectionRows(
		webCollections.currentOrganization,
	);
	const { rows: profiles } = useCollectionRows(webCollections.profiles);
	const organization = organizations.find((row) => row.id === localIdentity?.organizationId);
	if (organizationStatus === 'ready' && localIdentity !== null && organization === undefined) {
		throw new Error('Unable to resolve active organization for this workspace.');
	}
	const profile = profiles.find((row) => row.id === localIdentity?.profileId);

	const currentOrganization: ShellOrganization = {
		id: organization?.id ?? localIdentity?.organizationId ?? 'organization',
		name: organization?.name ?? 'Organization',
	};
	const shellUser: ShellUser = {
		name: profile?.displayName ?? user?.displayName ?? 'SIMMER User',
		email: user?.email ?? '',
		role: formatRole(localIdentity?.role),
	};

	return (
		<>
			<ShellProvider
				organizations={[currentOrganization]}
				currentOrganization={currentOrganization}
				onSelectOrganization={() => undefined}
				user={shellUser}
				domains={shellDomains}
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
				<OutletShell>
					<Outlet />
				</OutletShell>
			</ShellProvider>
			<Toaster richColors />
		</>
	);
}
