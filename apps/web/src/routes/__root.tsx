import { createRootRoute } from '@tanstack/react-router';
import { RootLayout } from './-components';

export interface RootSearch {
	readonly auth?: 'organization_required';
}

export const Route = createRootRoute({
	validateSearch: (search): RootSearch =>
		search.auth === 'organization_required' ? { auth: 'organization_required' } : {},
	component: RootLayout,
});
