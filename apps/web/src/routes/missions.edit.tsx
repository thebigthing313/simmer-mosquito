import { createFileRoute } from '@tanstack/react-router';
import { MissionEditPage } from './-components';

export const Route = createFileRoute('/missions/edit')({
	component: MissionEditPage,
});
