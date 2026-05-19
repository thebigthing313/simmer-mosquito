import { createFileRoute } from '@tanstack/react-router';
import { ServiceRequestsIndexPage } from './-components';

export const Route = createFileRoute('/service-requests/')({
	component: ServiceRequestsIndexPage,
});
