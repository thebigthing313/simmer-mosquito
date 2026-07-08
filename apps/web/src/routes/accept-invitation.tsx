import { createFileRoute } from '@tanstack/react-router';
import { AcceptInvitationPage } from './-auth';

export const Route = createFileRoute('/accept-invitation')({
	// WorkOS appends `?invitation_token=` to the configured User invitation URL;
	// accept a plain `token` too so the page is robust to either link shape.
	validateSearch: (search): { readonly invitation_token: string } => {
		const token =
			typeof search.invitation_token === 'string'
				? search.invitation_token
				: typeof search.token === 'string'
					? search.token
					: '';
		return { invitation_token: token };
	},
	component: AcceptInvitationRoute,
});

function AcceptInvitationRoute() {
	const { invitation_token } = Route.useSearch();
	return <AcceptInvitationPage token={invitation_token} />;
}
