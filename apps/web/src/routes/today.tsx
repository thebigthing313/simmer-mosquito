import { createFileRoute } from '@tanstack/react-router';
import { TodayActivitiesPage } from './-components';

export const Route = createFileRoute('/today')({
	component: TodayActivitiesPage,
});
