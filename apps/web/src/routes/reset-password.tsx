import { createFileRoute } from '@tanstack/react-router';
import { ResetPasswordPage } from './-auth';

export const Route = createFileRoute('/reset-password')({
	validateSearch: (search): { readonly token: string } => ({
		token: typeof search.token === 'string' ? search.token : '',
	}),
	component: ResetPasswordRoute,
});

function ResetPasswordRoute() {
	const { token } = Route.useSearch();
	return <ResetPasswordPage token={token} />;
}
