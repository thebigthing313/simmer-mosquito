import { createFileRoute } from '@tanstack/react-router';
import { DashboardPage } from './-components';

export const Route = createFileRoute('/')({
	component: DashboardPage,
});
