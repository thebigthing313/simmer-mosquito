import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/operations/missions/$id/edit')({
	component: RouteComponent,
});

function RouteComponent() {
	return <div>Hello "/operations/missions/$id/edit"!</div>;
}
