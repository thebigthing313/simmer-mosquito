import { RouterProvider } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { type AuthMe, getAuthMe, getServerUrl } from './api';
import { router } from './router';
import { adminCollections } from './sync/adminCollections';
import { preloadAdminCollections } from './sync/collections';

const serverUrl = getServerUrl();

export function AdminApp() {
	const [auth, setAuth] = useState<AuthMe | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		getAuthMe(serverUrl)
			.then((result) => {
				if (!cancelled) {
					setAuth(result);
					setError(null);
				}
			})
			.catch((loadError: unknown) => {
				if (!cancelled) {
					setError(loadError instanceof Error ? loadError.message : 'Unable to load auth state.');
				}
			});

		return () => {
			cancelled = true;
		};
	}, []);

	useEffect(() => {
		if (auth !== null) {
			void router.invalidate();
		}
	}, [auth]);

	useEffect(() => {
		if (auth?.authenticated === true) {
			preloadAdminCollections(adminCollections).catch((preloadError: unknown) => {
				setError(
					preloadError instanceof Error
						? preloadError.message
						: 'Unable to preload admin sync collections.',
				);
			});
		}
	}, [auth]);

	return (
		<>
			{error === null ? null : <div className="app-error">{error}</div>}
			<RouterProvider router={router} context={{ auth }} />
		</>
	);
}
