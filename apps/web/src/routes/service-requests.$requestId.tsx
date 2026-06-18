import { createFileRoute } from '@tanstack/react-router';
import { RouteStub } from '../components/app-shell/route-stub';

export const Route = createFileRoute('/service-requests/$requestId')({
	component: RouteStub,
});
