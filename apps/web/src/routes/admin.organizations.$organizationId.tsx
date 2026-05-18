import { createFileRoute } from '@tanstack/react-router';
import { AdminOrganizationDetailRoute } from './-components';

export const Route = createFileRoute('/admin/organizations/$organizationId')({
	component: AdminOrganizationDetailRoute,
});
