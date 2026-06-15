import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { createRouter, RouterProvider } from '@tanstack/react-router';
import { StrictMode, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/poppins/400.css';
import '@fontsource/poppins/500.css';
import '@fontsource/poppins/600.css';
import '@fontsource/poppins/700.css';
import '@fontsource/poppins/800.css';
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
			{import.meta.env.DEV ? <ReactQueryDevtools initialIsOpen={false} /> : null}
		</QueryClientProvider>
	</StrictMode>,
);
