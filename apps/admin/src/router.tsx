import { createRouter } from '@tanstack/react-router';
import { rootRoute } from './routes/__root';
import { authenticatedRoute } from './routes/_authenticated';
import { adminLayoutRoute } from './routes/_authenticated/_admin';
import { authenticatedIndexRoute } from './routes/_authenticated/index';
import { organizationsRoute } from './routes/_authenticated/organizations';
import { organizationUsersRoute } from './routes/_authenticated/organizations.$organizationId.users';
import { taxonomyRoute } from './routes/_authenticated/taxonomy';
import { unitsRoute } from './routes/_authenticated/units';
import { authRoute } from './routes/auth';

export const router = createRouter({
	routeTree: rootRoute.addChildren([
		authRoute,
		authenticatedRoute.addChildren([
			adminLayoutRoute.addChildren([
				authenticatedIndexRoute,
				organizationsRoute,
				organizationUsersRoute,
				taxonomyRoute,
				unitsRoute,
			]),
		]),
	]),
	context: {
		auth: null,
	},
});

declare module '@tanstack/react-router' {
	interface Register {
		router: typeof router;
	}
}
