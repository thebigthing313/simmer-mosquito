import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/operations/requests-for-control/create')({
	component: RouteComponent,
});

function RouteComponent() {
	return <div>Hello "/operations/requests-for-control/create"!</div>;
}
