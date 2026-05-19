import { createRootRouteWithContext, Outlet, redirect, useLocation } from '@tanstack/react-router';
import type { AppAuthController } from '../app-auth';
import { RootLayout } from './-components';

export interface RootSearch {
	readonly auth?: 'organization_required';
}

export interface RouterContext {
	readonly auth: AppAuthController;
}

const publicPaths = new Set(['/landing', '/login']);

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
	},
	component: RootComponent,
});

function RootComponent() {
	const location = useLocation();
	const { auth } = Route.useRouteContext();

	if (publicPaths.has(location.pathname)) {
		return <Outlet />;
	}

	return <RootLayout auth={auth.snapshot} />;
}
