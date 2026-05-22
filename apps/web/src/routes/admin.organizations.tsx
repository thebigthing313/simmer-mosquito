import { createFileRoute } from '@tanstack/react-router';
import { GroupsPage } from './-components';

export const Route = createFileRoute('/admin/organizations')({
	component: GroupsPage,
});
