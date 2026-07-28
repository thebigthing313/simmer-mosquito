import { createFileRoute } from '@tanstack/react-router';
import { UpcomingPage } from '../components/app-shell/upcoming-page';

export const Route = createFileRoute('/assignments')({
	component: UpcomingPage,
});
