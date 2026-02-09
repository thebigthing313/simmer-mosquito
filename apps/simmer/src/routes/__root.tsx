import { createRootRouteWithContext, Outlet } from '@tanstack/react-router';
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools';

// biome-ignore lint/complexity/noBannedTypes: <will code in later>
export type MyRouterContext = {};

const RootLayout = () => (
	<>
		<Outlet />
		<TanStackRouterDevtools />
	</>
);

export const Route = createRootRouteWithContext<MyRouterContext>()({
	component: RootLayout,
});
