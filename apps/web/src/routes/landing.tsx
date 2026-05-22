import { createFileRoute } from '@tanstack/react-router';
import { LandingPage } from './-components';

export const Route = createFileRoute('/landing')({
	validateSearch: (
		search,
	): { readonly auth?: 'organization_required'; readonly redirect: string } => {
		const parsed = {
			redirect:
				typeof search.redirect === 'string' && search.redirect.startsWith('/')
					? search.redirect
					: '/',
		};

		return search.auth === 'organization_required'
			? { ...parsed, auth: 'organization_required' }
			: parsed;
	},
	component: LandingRoute,
});

function LandingRoute() {
	const search = Route.useSearch();
	const redirectTo =
		typeof window === 'undefined'
			? search.redirect
			: new URL(search.redirect, window.location.origin).toString();

	return search.auth === undefined ? (
		<LandingPage redirectTo={redirectTo} />
	) : (
		<LandingPage authReason={search.auth} redirectTo={redirectTo} />
	);
}
