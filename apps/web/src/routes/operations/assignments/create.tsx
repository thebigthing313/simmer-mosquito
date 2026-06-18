import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/operations/assignments/create')({
	component: RouteComponent,
});

function RouteComponent() {
	return <div>Hello "/operations/assignments/create"!</div>;
}
