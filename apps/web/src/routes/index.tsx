import { createFileRoute } from '@tanstack/react-router';
import { AppShell } from './-components';

export const Route = createFileRoute('/')({
	component: AppShell,
});
