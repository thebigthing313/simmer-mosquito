import { createFileRoute } from '@tanstack/react-router';
import { LoginRoute } from './-components';

export const Route = createFileRoute('/login')({
	component: LoginRoute,
});
