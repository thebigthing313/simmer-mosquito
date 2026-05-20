import { createFileRoute } from '@tanstack/react-router';
import { MyOrganizationPage } from '../-my-organization';

export const Route = createFileRoute('/my-organization/larval-surveillance')({
	component: MyOrganizationLarvalSurveillanceRoute,
});

function MyOrganizationLarvalSurveillanceRoute() {
	const { auth } = Route.useRouteContext();

	return <MyOrganizationPage auth={auth.snapshot} section="larval" />;
}
