import { createFileRoute } from '@tanstack/react-router';
import { UpcomingPage } from '../../components/app-shell/upcoming-page';

export const Route = createFileRoute('/adult-surveillance/arbovirus-surveillance')({
	component: UpcomingPage,
});
