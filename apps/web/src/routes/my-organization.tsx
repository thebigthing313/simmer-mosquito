import { createFileRoute, Outlet } from '@tanstack/react-router';

export const Route = createFileRoute('/my-organization')({
	component: MyOrganizationRoute,
});

function MyOrganizationRoute() {
	return <Outlet />;
}
