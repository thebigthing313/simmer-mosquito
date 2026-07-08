import { createFileRoute } from '@tanstack/react-router';
import { SignUpPage } from './-auth';

export const Route = createFileRoute('/sign-up')({
	validateSearch: (search): { readonly redirect?: string } => {
		const redirect =
			typeof search.redirect === 'string' && search.redirect.startsWith('/')
				? search.redirect
				: undefined;
		return redirect === undefined ? {} : { redirect };
	},
	component: SignUpRoute,
});

function SignUpRoute() {
	const { redirect } = Route.useSearch();
	return <SignUpPage redirectTo={redirect ?? '/'} />;
}
