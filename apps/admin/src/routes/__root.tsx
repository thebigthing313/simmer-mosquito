import type { AppAuthController } from '@simmer-mosquito/auth/browser';
import { createRootRouteWithContext, Outlet, redirect, useLocation } from '@tanstack/react-router';
import { publicPaths } from '../app-auth';
import { AdminShellRoot } from '../components/app-shell/admin-shell-root';

// Exported because the generated route tree names this type in its inferred
// signatures; nothing imports it directly, but declaration emit needs it —
// unexporting it fails the build with TS4023.
// fallow-ignore-next-line unused-type
export interface RouterContext {
	readonly auth: AppAuthController;
}

export const Route = createRootRouteWithContext<RouterContext>()({
	beforeLoad: async ({ context, location }) => {
		if (publicPaths.has(location.pathname)) {
			return;
		}

		const auth = await context.auth.load();
		if (auth.authenticated !== true) {
			throw redirect({ to: '/sign-in', search: { redirect: location.href } });
		}

		/*
		 * Deliberately no organization check, unlike apps/web's root.
		 *
		 * A SIMMER operator administers agencies from outside them and need not be
		 * a member of any, so a null `localIdentity.organizationId` is normal here
		 * rather than the broken state web treats it as.
		 *
		 * What actually gates this console is the operator allowlist, and only the
		 * server knows it — `/auth/me` answers "are you signed in", not "are you an
		 * operator". So the refusal surfaces where it is decided: a 403
		 * `operator_required` from the first `/admin/*` call, which the pages turn
		 * into an explanation rather than a raw error.
		 */
	},
	component: RootComponent,
});

function RootComponent() {
	const location = useLocation();
	const { auth } = Route.useRouteContext();

	if (publicPaths.has(location.pathname)) {
		return <Outlet />;
	}

	return <AdminShellRoot auth={auth.snapshot} />;
}
