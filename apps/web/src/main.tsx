import { createRouter, RouterProvider } from '@tanstack/react-router';
import { StrictMode, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import { appAuthController } from './app-auth';
import { routeTree } from './routeTree.gen';
import './styles.css';

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
		<App />
	</StrictMode>,
);
