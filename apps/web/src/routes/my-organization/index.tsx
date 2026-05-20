import { createFileRoute } from '@tanstack/react-router';
import { MyOrganizationPage } from '../-my-organization';

export const Route = createFileRoute('/my-organization/')({
	component: MyOrganizationGeneralRoute,
});

function MyOrganizationGeneralRoute() {
	const { auth } = Route.useRouteContext();

	return <MyOrganizationPage auth={auth.snapshot} section="general" />;
}
