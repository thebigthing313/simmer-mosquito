import { createFileRoute, Navigate } from '@tanstack/react-router';

export const Route = createFileRoute('/')({
	component: () => <Navigate to="/design-tokens" replace />,
});
