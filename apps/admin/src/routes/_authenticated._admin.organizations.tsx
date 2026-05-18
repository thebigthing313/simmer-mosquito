import { createFileRoute, Outlet } from '@tanstack/react-router';

export const Route = createFileRoute('/_authenticated/_admin/organizations')({
	component: OrganizationsRoute,
});

function OrganizationsRoute() {
	return <Outlet />;
}
