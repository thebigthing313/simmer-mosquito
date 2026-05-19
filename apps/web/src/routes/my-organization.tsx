import { createFileRoute } from '@tanstack/react-router';
import { MyOrganizationPage } from './-my-organization';

export const Route = createFileRoute('/my-organization')({
	component: MyOrganizationRoute,
});

function MyOrganizationRoute() {
	const { auth } = Route.useRouteContext();

	return <MyOrganizationPage auth={auth.snapshot} />;
}
