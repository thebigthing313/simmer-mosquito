import { createFileRoute } from '@tanstack/react-router';
import { AdminOrganizationsRoute } from './-components';

export const Route = createFileRoute('/admin/organizations')({
	component: AdminOrganizationsRoute,
});
