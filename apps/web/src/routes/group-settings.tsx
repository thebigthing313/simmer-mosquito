import { createFileRoute, Navigate } from '@tanstack/react-router';

export const Route = createFileRoute('/group-settings')({
	component: () => <Navigate replace to="/my-organization" />,
});
