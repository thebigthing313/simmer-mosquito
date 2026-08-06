import { createFileRoute } from '@tanstack/react-router';
import { OperatorSignInPage } from './-auth';

export const Route = createFileRoute('/sign-in')({
	validateSearch: (search): { readonly redirect?: string } => {
		const redirect =
			typeof search.redirect === 'string' && search.redirect.startsWith('/')
				? search.redirect
				: undefined;
		return redirect === undefined ? {} : { redirect };
	},
	component: SignInRoute,
});

function SignInRoute() {
	const { redirect } = Route.useSearch();
	return <OperatorSignInPage redirectTo={redirect ?? '/organizations'} />;
}
