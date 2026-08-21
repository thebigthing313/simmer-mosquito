import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRouter, RouterProvider } from '@tanstack/react-router';
import { StrictMode, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
// Latin subsets only. The unqualified `@fontsource/poppins/400.css` entries pull
// latin, latin-ext, and devanagari — 15 files and ~263 KB of build output, of
// which devanagari is ~196 KB we will never render. `unicode-range` means a
// browser skips downloading it, so this is build and CDN weight rather than
// user-facing latency, but it is weight for nothing. latin-ext stays: operator
// and contact names carry European diacritics and it is only ~5 KB per weight.
import '@fontsource/poppins/latin-400.css';
import '@fontsource/poppins/latin-ext-400.css';
import '@fontsource/poppins/latin-500.css';
import '@fontsource/poppins/latin-ext-500.css';
import '@fontsource/poppins/latin-600.css';
import '@fontsource/poppins/latin-ext-600.css';
import '@fontsource/poppins/latin-700.css';
import '@fontsource/poppins/latin-ext-700.css';
import '@fontsource/poppins/latin-800.css';
import '@fontsource/poppins/latin-ext-800.css';
import { OutletContentFallback } from '@simmer-mosquito/ui-web/components/app-shell';
import { RouteErrorPage } from '@simmer-mosquito/ui-web/components/error-report';
import { appAuthController } from './app-auth';
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
	// Every route that does not name its own error component falls here. Without
	// it they fell to TanStack's built-in, which prints the message in a bare
	// `<pre>` and offers nothing to act on. The root route keeps its own, because
	// a failure there means the shell never mounted.
	defaultErrorComponent: (props) => <RouteErrorPage {...props} version={__APP_VERSION__} />,
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
