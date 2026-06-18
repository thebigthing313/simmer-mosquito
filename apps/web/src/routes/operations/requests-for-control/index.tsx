import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/operations/requests-for-control/')({
	component: RouteComponent,
});

function RouteComponent() {
	return <div>Hello "/operations/requests-for-control/"!</div>;
}
