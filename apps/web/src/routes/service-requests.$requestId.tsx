import { createFileRoute } from '@tanstack/react-router';
import { ServiceRequestDetailPage } from './-components';

export const Route = createFileRoute('/service-requests/$requestId')({
	component: ServiceRequestDetailPage,
});
