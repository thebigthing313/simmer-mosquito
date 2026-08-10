import type { AppAuthController } from '@simmer-mosquito/auth/browser';
import { createRootRouteWithContext, Outlet, redirect, useLocation } from '@tanstack/react-router';
import { AppShellRoot } from '../components/app-shell/app-shell-root';
import { SuspenseQueryBoundary } from '../sync/suspense-query-boundary';
import { WorkspaceChromeError, WorkspaceChromeFallback } from './-components';

// Both are exported because the generated route tree names them in its inferred
// signatures; nothing imports them directly, but declaration emit needs them —
// unexporting them fails the build with TS4023.
// fallow-ignore-next-line unused-type
export interface RootSearch {
	readonly auth?: 'organization_required';
}

// fallow-ignore-next-line unused-type
export interface RouterContext {
	readonly auth: AppAuthController;
}

const publicPaths = new Set([
	'/landing',
	'/sign-in',
	'/sign-up',
	'/forgot-password',
	'/reset-password',
	'/accept-invitation',
]);

export const Route = createRootRouteWithContext<RouterContext>()({
	validateSearch: (search): RootSearch =>
		search.auth === 'organization_required' ? { auth: 'organization_required' } : {},
	beforeLoad: async ({ context, location }) => {
		if (publicPaths.has(location.pathname)) {
			return;
		}

		const auth = await context.auth.load();
		if (auth.authenticated !== true) {
			throw redirect({
				to: '/landing',
				search: {
					redirect: location.href,
				},
			});
		}

		if (auth.localIdentity.organizationId === null) {
			throw new Error('Authenticated user is missing an active organization.');
		}
	},
	component: RootComponent,
	errorComponent: WorkspaceChromeError,
});

function RootComponent() {
	const location = useLocation();
	const { auth } = Route.useRouteContext();

	if (publicPaths.has(location.pathname)) {
		return <Outlet />;
	}

	return (
		<SuspenseQueryBoundary
			errorFallback={<WorkspaceChromeError />}
			loadingFallback={<WorkspaceChromeFallback />}
			resetKey="root-layout"
		>
			<AppShellRoot auth={auth.snapshot} />
		</SuspenseQueryBoundary>
	);
}
