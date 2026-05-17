import { createRootRouteWithContext, Outlet } from '@tanstack/react-router';
import { type AuthMe } from '../api';

export interface RouterContext {
	readonly auth: AuthMe | null;
}

export const rootRoute = createRootRouteWithContext<RouterContext>()({
	component: RootLayout,
});

function RootLayout() {
	return (
		<div className="page">
			<main>
				<Outlet />
			</main>
		</div>
	);
}
