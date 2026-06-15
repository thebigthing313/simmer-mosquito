import { createRootRouteWithContext, Outlet, redirect, useLocation } from '@tanstack/react-router';
import type { AppAuthController } from '../app-auth';
import { SuspenseQueryBoundary } from '../sync/suspense-query-boundary';
import { RootLayout, WorkspaceChromeError, WorkspaceChromeFallback } from './-components';

export interface RootSearch {
	readonly auth?: 'organization_required';
}

export interface RouterContext {
	readonly auth: AppAuthController;
}

const publicPaths = new Set(['/landing', '/login']);

/** Dev-only layout design previews render standalone, without the product chrome or auth. */
const isPreviewPath = (pathname: string) => pathname.startsWith('/layout-preview');

export const Route = createRootRouteWithContext<RouterContext>()({
	validateSearch: (search): RootSearch =>
		search.auth === 'organization_required' ? { auth: 'organization_required' } : {},
	beforeLoad: async ({ context, location }) => {
		if (publicPaths.has(location.pathname) || isPreviewPath(location.pathname)) {
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

	if (publicPaths.has(location.pathname) || isPreviewPath(location.pathname)) {
		return <Outlet />;
	}

	return (
		<SuspenseQueryBoundary
			errorFallback={<WorkspaceChromeError />}
			loadingFallback={<WorkspaceChromeFallback />}
			resetKey="root-layout"
		>
			<RootLayout auth={auth.snapshot} />
		</SuspenseQueryBoundary>
	);
}
