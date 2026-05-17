import { createRoute, redirect } from '@tanstack/react-router';
import { adminLayoutRoute } from './_admin';

export const authenticatedIndexRoute = createRoute({
	getParentRoute: () => adminLayoutRoute,
	path: '/',
	beforeLoad: () => {
		throw redirect({ to: '/organizations' });
	},
});
