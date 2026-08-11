import {
	BreadcrumbLabelProvider,
	OutletContentFallback,
	OutletShell,
	type ShellOrganization,
	ShellProvider,
	type ShellUser,
} from '@simmer-mosquito/ui-web/components/app-shell';
import { Toaster } from '@simmer-mosquito/ui-web/components/ui/sonner';
import { Outlet, useLocation, useNavigate } from '@tanstack/react-router';
import { Suspense } from 'react';
import { type AuthMe, adminLogoutUrl } from '../../api';
import { adminShellDomains, adminStandalonePages } from './navigation';

/**
 * Mounts the shared shell for the operator console.
 *
 * The web workspace binds its chrome to synced organization and profile
 * collections; there is nothing equivalent to bind here. An operator is not a
 * member of the agencies they administer — `SIMMER_OPERATOR_EMAILS` is the whole
 * grant — so the identity in the chrome comes from the auth snapshot alone and
 * needs no sync at all.
 *
 * The switcher slot therefore names the control plane rather than an agency.
 * Leaving it showing an agency name would be worse than useless: it would imply
 * the console is scoped to one, when every page here spans all of them.
 */
export function AdminShellRoot({ auth }: { readonly auth: AuthMe | null }) {
	const navigate = useNavigate();
	const { pathname } = useLocation();
	const user = auth?.authenticated === true ? auth.user : null;

	const controlPlane: ShellOrganization = {
		id: 'simmer-operator',
		name: 'SIMMER Operations',
		detail: 'Control plane',
	};
	const shellUser: ShellUser = {
		name: user?.displayName ?? 'SIMMER Operator',
		email: user?.email ?? '',
		role: 'Operator',
	};

	return (
		<>
			<ShellProvider
				organizations={[controlPlane]}
				currentOrganization={controlPlane}
				onSelectOrganization={() => undefined}
				user={shellUser}
				domains={adminShellDomains}
				standalonePages={adminStandalonePages}
				version={__APP_VERSION__}
				activePath={pathname}
				onNavigate={(to) => {
					// The shell models destinations as plain strings; the router's typed
					// `to` is satisfied by an assertion at this single adapter seam.
					navigate({ to: to as never });
				}}
				onSignOut={() => {
					window.location.href = adminLogoutUrl();
				}}
			>
				<BreadcrumbLabelProvider>
					<OutletShell>
						{/* Backstop only — route pages suspend into the per-match boundary
						    the router builds from `defaultPendingComponent` (see main.tsx).
						    Deliberately unkeyed: keying it would remount every page on
						    navigation. */}
						<Suspense fallback={<OutletContentFallback />}>
							<Outlet />
						</Suspense>
					</OutletShell>
				</BreadcrumbLabelProvider>
			</ShellProvider>
			<Toaster richColors />
		</>
	);
}
