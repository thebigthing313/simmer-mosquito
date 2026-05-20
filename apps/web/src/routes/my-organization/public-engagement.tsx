import { createFileRoute } from '@tanstack/react-router';
import { MyOrganizationPage } from '../-my-organization';

export const Route = createFileRoute('/my-organization/public-engagement')({
	component: MyOrganizationPublicEngagementRoute,
});

function MyOrganizationPublicEngagementRoute() {
	const { auth } = Route.useRouteContext();

	return <MyOrganizationPage auth={auth.snapshot} section="public" />;
}
