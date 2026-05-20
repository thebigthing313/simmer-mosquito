import { createFileRoute } from '@tanstack/react-router';
import { MyOrganizationPage } from '../-my-organization';

export const Route = createFileRoute('/my-organization/control-methods')({
	component: MyOrganizationControlMethodsRoute,
});

function MyOrganizationControlMethodsRoute() {
	const { auth } = Route.useRouteContext();

	return <MyOrganizationPage auth={auth.snapshot} section="control" />;
}
