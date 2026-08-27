import { OutletContentFallback } from '@simmer-mosquito/ui-web/components/app-shell';
import { RouteErrorPage } from '@simmer-mosquito/ui-web/components/error-report';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRouter, RouterProvider } from '@tanstack/react-router';
import { StrictMode, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
// Latin subsets only, matching apps/web — the unqualified entries also pull
// devanagari, which is ~196 KB of build output this console will never render.
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
import { isAdminRefusal } from './api';
import { appAuthController } from './app-auth';
import { routeTree } from './routeTree.gen';
import '@simmer-mosquito/ui-web/styles.css';
import './styles.css';

const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			refetchOnWindowFocus: false,
			// A refusal is an answer, so asking again three times only delays it.
			// The operator refusals are 403s, and under the default the console
			// showed a spinner for about six seconds before naming what was wrong.
			retry: (failureCount, error) => !isAdminRefusal(error) && failureCount < 3,
			staleTime: 5000,
		},
	},
});

const router = createRouter({
	routeTree,
	context: {
		auth: appAuthController,
	},
	// Gives every route match its own Suspense boundary, so a page waiting on its
	// collections renders this fallback inside the shell rather than blanking the
	// console. See the longer note on the same line in apps/web's main.tsx.
	defaultPendingComponent: OutletContentFallback,
	// Every route that does not name its own error component falls here. See the
	// longer note on the same line in apps/web's main.tsx.
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
