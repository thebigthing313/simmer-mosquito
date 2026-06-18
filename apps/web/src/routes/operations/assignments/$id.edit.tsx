import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/operations/assignments/$id/edit')({
	component: RouteComponent,
});

function RouteComponent() {
	return <div>Hello "/operations/assignments/$id/edit"!</div>;
}
