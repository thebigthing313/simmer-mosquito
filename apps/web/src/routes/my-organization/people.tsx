import { createFileRoute } from '@tanstack/react-router';
import { MyOrganizationPage } from '../-my-organization';

export const Route = createFileRoute('/my-organization/people')({
	component: MyOrganizationPeopleRoute,
});

function MyOrganizationPeopleRoute() {
	const { auth } = Route.useRouteContext();

	return <MyOrganizationPage auth={auth.snapshot} section="people" />;
}
