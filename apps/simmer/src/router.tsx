import { createRouter } from '@tanstack/react-router';
import type { MyRouterContext } from './routes/__root';
import { routeTree } from './routeTree.gen';

const routeContext: MyRouterContext = { mainOutlet: null };
export function getRouter() {
	const router = createRouter({
		context: routeContext,
		routeTree,
		scrollRestoration: true,
	});

	return router;
}

declare module '@tanstack/react-router' {
	interface Register {
		router: ReturnType<typeof getRouter>;
	}
}
