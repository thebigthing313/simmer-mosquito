import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRouter, RouterProvider } from '@tanstack/react-router';
import { StrictMode, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/poppins/400.css';
import '@fontsource/poppins/500.css';
import '@fontsource/poppins/600.css';
import '@fontsource/poppins/700.css';
import '@fontsource/poppins/800.css';
import { appAuthController } from './app-auth';
import { OutletContentFallback } from './components/app-shell/outlet/outlet-content-fallback';
import { routeTree } from './routeTree.gen';
import './styles.css';

const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			refetchOnWindowFocus: false,
			staleTime: 5000,
		},
	},
});

const router = createRouter({
	routeTree,
	context: {
		auth: appAuthController,
	},
	// Gives every route match its own Suspense boundary (see `MatchView` — the
	// router only wraps a match in Suspense when a pending component exists).
	// That boundary mounts together with the page, so a page suspending on its
	// collections actually renders this fallback; a boundary further up has
	// already committed by then and React suppresses its fallback mid-transition.
	defaultPendingComponent: OutletContentFallback,
});

declare module '@tanstack/react-router' {
	interface Register {
		router: typeof router;
	}
}

const rootElement = document.getElementById('root');
if (rootElement === null) {
	throw new Error('Root element not found.');
}

function App() {
	useSyncExternalStore(
		appAuthController.subscribe,
		() => appAuthController.snapshot,
		() => appAuthController.snapshot,
	);

	return <RouterProvider router={router} context={{ auth: appAuthController }} />;
}

createRoot(rootElement).render(
	<StrictMode>
		<QueryClientProvider client={queryClient}>
			<App />
		</QueryClientProvider>
	</StrictMode>,
);
