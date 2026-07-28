import { createFileRoute } from '@tanstack/react-router';
import { UpcomingPage } from '../components/app-shell/upcoming-page';

export const Route = createFileRoute('/admin/organizations')({
	component: () => <UpcomingPage title="Organizations" />,
});
