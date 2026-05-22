import { createFileRoute } from '@tanstack/react-router';
import { LoginPage } from './-components';

export const Route = createFileRoute('/login')({
	component: LoginPage,
});
