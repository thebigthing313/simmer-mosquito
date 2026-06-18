import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/operations/assignments/$id')({
	component: RouteComponent,
});

function RouteComponent() {
	return <div>Hello "/operations/assignments/$id"!</div>;
}
